import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const ref = name => ({ Ref: name })
const sub = text => ({ 'Fn::Sub': text })
const get = (name, attribute) => ({ 'Fn::GetAtt': [name, attribute] })
const serviceNames = ['auth', 'chat', 'agent', 'billing', 'gateway']
const projectParameter = { Type: 'String', Default: 'agentverse', AllowedPattern: '[a-z][a-z0-9-]{2,19}' }
const assumeEcs = { Version: '2012-10-17', Statement: [{ Effect: 'Allow', Principal: { Service: 'ecs-tasks.amazonaws.com' }, Action: 'sts:AssumeRole' }] }
const allow = (Action, Resource) => ({ Effect: 'Allow', Action, Resource })
const policy = Statement => ({ Version: '2012-10-17', Statement })

const bootstrap = {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'AgentVerse ECR repositories and main-branch GitHub OIDC deploy role. Creates billable ECR storage when images are pushed.',
    Parameters: {
        ProjectName: projectParameter,
        GitHubOwner: { Type: 'String', AllowedPattern: '[A-Za-z0-9-]+' },
        GitHubRepository: { Type: 'String', AllowedPattern: '[A-Za-z0-9_.-]+' },
        ExistingGitHubOidcArn: { Type: 'String', Default: '', Description: 'If this account already has the token.actions.githubusercontent.com IAM provider, enter its ARN.' }
    },
    Conditions: { CreateOidc: { 'Fn::Equals': [ref('ExistingGitHubOidcArn'), ''] } },
    Resources: {}, Outputs: {}
}
for (const name of serviceNames) {
    bootstrap.Resources[name + 'Repository'] = { Type: 'AWS::ECR::Repository', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
        RepositoryName: sub('${ProjectName}-' + name), ImageTagMutability: 'IMMUTABLE',
        ImageScanningConfiguration: { ScanOnPush: true }
    } }
}
bootstrap.Resources.GitHubOidc = { Type: 'AWS::IAM::OIDCProvider', Condition: 'CreateOidc', Properties: {
    Url: 'https://token.actions.githubusercontent.com', ClientIdList: ['sts.amazonaws.com']
} }
bootstrap.Resources.DeployRole = { Type: 'AWS::IAM::Role', Properties: {
    RoleName: sub('${ProjectName}-github-deploy'),
    AssumeRolePolicyDocument: policy([{ Effect: 'Allow', Principal: { Federated: { 'Fn::If': ['CreateOidc', ref('GitHubOidc'), ref('ExistingGitHubOidcArn')] } }, Action: 'sts:AssumeRoleWithWebIdentity', Condition: {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com', 'token.actions.githubusercontent.com:sub': sub('repo:${GitHubOwner}/${GitHubRepository}:ref:refs/heads/main') }
    } }]),
    Policies: [{ PolicyName: 'PublishAndDeploy', PolicyDocument: policy([
        allow(['ecr:GetAuthorizationToken'], '*'),
        allow(['ecr:DescribeImages', 'ecr:BatchCheckLayerAvailability', 'ecr:InitiateLayerUpload', 'ecr:UploadLayerPart', 'ecr:CompleteLayerUpload', 'ecr:PutImage', 'ecr:BatchGetImage', 'ecr:GetDownloadUrlForLayer'], serviceNames.map(name => get(name + 'Repository', 'Arn'))),
        allow(['ecs:RegisterTaskDefinition', 'ecs:DescribeTaskDefinition'], '*'),
        allow(['ecs:UpdateService', 'ecs:DescribeServices'], sub('arn:${AWS::Partition}:ecs:${AWS::Region}:${AWS::AccountId}:service/${ProjectName}/*')),
        { ...allow(['iam:PassRole'], [sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/${ProjectName}-execution'), sub('arn:${AWS::Partition}:iam::${AWS::AccountId}:role/${ProjectName}-agent')]), Condition: { StringEquals: { 'iam:PassedToService': 'ecs-tasks.amazonaws.com' } } },
        allow(['cloudformation:DescribeStacks'], sub('arn:${AWS::Partition}:cloudformation:${AWS::Region}:${AWS::AccountId}:stack/${ProjectName}-app/*')),
        allow(['s3:ListBucket'], sub('arn:${AWS::Partition}:s3:::${ProjectName}-frontend-${AWS::AccountId}-${AWS::Region}')),
        allow(['s3:GetObject', 's3:PutObject', 's3:DeleteObject'], sub('arn:${AWS::Partition}:s3:::${ProjectName}-frontend-${AWS::AccountId}-${AWS::Region}/*')),
        allow(['cloudfront:CreateInvalidation'], sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/*'))
    ]) }]
} }
bootstrap.Outputs.GitHubRoleArn = { Value: get('DeployRole', 'Arn') }

const app = {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: 'AgentVerse initial AWS deployment: five private Fargate services, ALB, CloudFront, private frontend S3, NAT and encrypted Redis. This stack incurs ongoing charges.',
    Parameters: {
        ProjectName: projectParameter,
        ImageTag: { Type: 'String', Default: 'bootstrap', AllowedPattern: '[A-Za-z0-9_.-]+' },
        DesiredCount: { Type: 'Number', Default: 0, MinValue: 0, MaxValue: 2, Description: 'Start at zero, allowlist the NAT IP in Atlas, authorize Firebase domain, then update to one.' },
        RuntimeSecretArn: { Type: 'String', Description: 'ARN of the JSON secret containing application keys. Do not paste secret values here.' },
        UploadsBucketName: { Type: 'String', Description: 'Existing private generated-files bucket in this same region.' },
        OriginToken: { Type: 'String', NoEcho: true, MinLength: 32, MaxLength: 64, AllowedPattern: '[A-Za-z0-9]+' },
        RedisNodeType: { Type: 'String', Default: 'cache.t4g.micro' }
    },
    Resources: {}, Outputs: {}
}
const resources = app.Resources
resources.Vpc = { Type: 'AWS::EC2::VPC', Properties: { CidrBlock: '10.42.0.0/16', EnableDnsHostnames: true, EnableDnsSupport: true } }
resources.InternetGateway = { Type: 'AWS::EC2::InternetGateway' }
resources.GatewayAttachment = { Type: 'AWS::EC2::VPCGatewayAttachment', Properties: { VpcId: ref('Vpc'), InternetGatewayId: ref('InternetGateway') } }
resources.PublicRoutes = { Type: 'AWS::EC2::RouteTable', Properties: { VpcId: ref('Vpc') } }
resources.PublicDefaultRoute = { Type: 'AWS::EC2::Route', DependsOn: 'GatewayAttachment', Properties: { RouteTableId: ref('PublicRoutes'), DestinationCidrBlock: '0.0.0.0/0', GatewayId: ref('InternetGateway') } }
for (const [number, zone] of [[1, 0], [2, 1]]) {
    for (const type of ['Public', 'Private']) {
        const name = type + number
        resources[name] = { Type: 'AWS::EC2::Subnet', Properties: { VpcId: ref('Vpc'), CidrBlock: `10.42.${(type === 'Public' ? 0 : 10) + number}.0/24`, AvailabilityZone: { 'Fn::Select': [zone, { 'Fn::GetAZs': '' }] }, MapPublicIpOnLaunch: type === 'Public' } }
        resources[name + 'Association'] = { Type: 'AWS::EC2::SubnetRouteTableAssociation', Properties: { SubnetId: ref(name), RouteTableId: ref(type + 'Routes') } }
    }
}
resources.NatAddress = { Type: 'AWS::EC2::EIP', DependsOn: 'GatewayAttachment', Properties: { Domain: 'vpc' } }
resources.NatGateway = { Type: 'AWS::EC2::NatGateway', Properties: { AllocationId: get('NatAddress', 'AllocationId'), SubnetId: ref('Public1') } }
resources.PrivateRoutes = { Type: 'AWS::EC2::RouteTable', Properties: { VpcId: ref('Vpc') } }
resources.PrivateDefaultRoute = { Type: 'AWS::EC2::Route', DependsOn: 'PublicDefaultRoute', Properties: { RouteTableId: ref('PrivateRoutes'), DestinationCidrBlock: '0.0.0.0/0', NatGatewayId: ref('NatGateway') } }
resources.LoadBalancerSecurity = { Type: 'AWS::EC2::SecurityGroup', Properties: { GroupDescription: 'Public ALB; listener requires CloudFront origin token', VpcId: ref('Vpc'), SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 80, ToPort: 80, CidrIp: '0.0.0.0/0' }] } }
resources.TasksSecurity = { Type: 'AWS::EC2::SecurityGroup', Properties: { GroupDescription: 'Private ECS tasks', VpcId: ref('Vpc') } }
resources.TaskPeers = { Type: 'AWS::EC2::SecurityGroupIngress', Properties: { GroupId: ref('TasksSecurity'), SourceSecurityGroupId: ref('TasksSecurity'), IpProtocol: 'tcp', FromPort: 8000, ToPort: 8004 } }
resources.GatewayFromAlb = { Type: 'AWS::EC2::SecurityGroupIngress', Properties: { GroupId: ref('TasksSecurity'), SourceSecurityGroupId: ref('LoadBalancerSecurity'), IpProtocol: 'tcp', FromPort: 8000, ToPort: 8000 } }
resources.RedisSecurity = { Type: 'AWS::EC2::SecurityGroup', Properties: { GroupDescription: 'Redis accessible only by ECS tasks', VpcId: ref('Vpc'), SecurityGroupIngress: [{ IpProtocol: 'tcp', FromPort: 6379, ToPort: 6379, SourceSecurityGroupId: ref('TasksSecurity') }] } }
resources.RedisSubnets = { Type: 'AWS::ElastiCache::SubnetGroup', Properties: { Description: 'Private Redis subnets', SubnetIds: [ref('Private1'), ref('Private2')] } }
resources.RedisAuthToken = { Type: 'AWS::SecretsManager::Secret', Properties: { Description: 'Generated Redis authentication token', GenerateSecretString: { PasswordLength: 48, ExcludePunctuation: true, IncludeSpace: false } } }
resources.Redis = { Type: 'AWS::ElastiCache::ReplicationGroup', DeletionPolicy: 'Snapshot', UpdateReplacePolicy: 'Snapshot', Properties: {
    ReplicationGroupDescription: 'AgentVerse sessions and cache; single node initial deployment', Engine: 'redis', EngineVersion: '7.1', CacheNodeType: ref('RedisNodeType'), NumCacheClusters: 1,
    AutomaticFailoverEnabled: false, AtRestEncryptionEnabled: true, TransitEncryptionEnabled: true,
    AuthToken: sub('{{resolve:secretsmanager:${RedisAuthToken}:SecretString}}'), CacheSubnetGroupName: ref('RedisSubnets'), SecurityGroupIds: [ref('RedisSecurity')], SnapshotRetentionLimit: 1
} }
resources.RedisSecret = { Type: 'AWS::SecretsManager::Secret', Properties: { Description: 'Private TLS Redis URL', SecretString: sub('rediss://:{{resolve:secretsmanager:${RedisAuthToken}:SecretString}}@${Redis.PrimaryEndPoint.Address}:${Redis.PrimaryEndPoint.Port}') } }
resources.Cluster = { Type: 'AWS::ECS::Cluster', Properties: { ClusterName: ref('ProjectName') } }
resources.Namespace = { Type: 'AWS::ServiceDiscovery::HttpNamespace', Properties: { Name: sub('${ProjectName}-internal') } }
resources.Logs = { Type: 'AWS::Logs::LogGroup', Properties: { LogGroupName: sub('/ecs/${ProjectName}'), RetentionInDays: 14 } }
resources.ExecutionRole = { Type: 'AWS::IAM::Role', Properties: {
    RoleName: sub('${ProjectName}-execution'), AssumeRolePolicyDocument: assumeEcs,
    ManagedPolicyArns: [sub('arn:${AWS::Partition}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy')],
    Policies: [{ PolicyName: 'RuntimeSecrets', PolicyDocument: policy([allow(['secretsmanager:GetSecretValue'], [ref('RuntimeSecretArn'), ref('RedisSecret')])]) }]
} }
resources.AgentRole = { Type: 'AWS::IAM::Role', Properties: { RoleName: sub('${ProjectName}-agent'), AssumeRolePolicyDocument: assumeEcs, Policies: [{ PolicyName: 'GeneratedFiles', PolicyDocument: policy([allow(['s3:GetObject', 's3:PutObject'], sub('arn:${AWS::Partition}:s3:::${UploadsBucketName}/*'))]) }] } }
resources.FrontendBucket = { Type: 'AWS::S3::Bucket', DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain', Properties: {
    BucketName: sub('${ProjectName}-frontend-${AWS::AccountId}-${AWS::Region}'),
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] }
} }
resources.OriginAccess = { Type: 'AWS::CloudFront::OriginAccessControl', Properties: { OriginAccessControlConfig: { Name: sub('${ProjectName}-frontend'), OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4' } } }
resources.Alb = { Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer', DependsOn: 'GatewayAttachment', Properties: { Scheme: 'internet-facing', Type: 'application', Subnets: [ref('Public1'), ref('Public2')], SecurityGroups: [ref('LoadBalancerSecurity')], LoadBalancerAttributes: [{ Key: 'idle_timeout.timeout_seconds', Value: '180' }] } }
resources.GatewayTargets = { Type: 'AWS::ElasticLoadBalancingV2::TargetGroup', Properties: { VpcId: ref('Vpc'), Port: 8000, Protocol: 'HTTP', TargetType: 'ip', HealthCheckPath: '/health', Matcher: { HttpCode: '200' }, TargetGroupAttributes: [{ Key: 'deregistration_delay.timeout_seconds', Value: '30' }] } }
resources.AlbListener = { Type: 'AWS::ElasticLoadBalancingV2::Listener', Properties: { LoadBalancerArn: ref('Alb'), Port: 80, Protocol: 'HTTP', DefaultActions: [{ Type: 'fixed-response', FixedResponseConfig: { StatusCode: '403', ContentType: 'text/plain', MessageBody: 'Forbidden' } }] } }
resources.CloudFrontOnly = { Type: 'AWS::ElasticLoadBalancingV2::ListenerRule', Properties: { ListenerArn: ref('AlbListener'), Priority: 1, Conditions: [{ Field: 'http-header', HttpHeaderConfig: { HttpHeaderName: 'X-AgentVerse-Origin', Values: [ref('OriginToken')] } }], Actions: [{ Type: 'forward', TargetGroupArn: ref('GatewayTargets') }] } }
resources.ApiCache = { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: { Name: sub('${ProjectName}-api-no-cache'), MinTTL: 0, DefaultTTL: 0, MaxTTL: 0, ParametersInCacheKeyAndForwardedToOrigin: { CookiesConfig: { CookieBehavior: 'none' }, HeadersConfig: { HeaderBehavior: 'none' }, QueryStringsConfig: { QueryStringBehavior: 'none' }, EnableAcceptEncodingGzip: false, EnableAcceptEncodingBrotli: false } } } }
resources.StaticCache = { Type: 'AWS::CloudFront::CachePolicy', Properties: { CachePolicyConfig: { Name: sub('${ProjectName}-static'), MinTTL: 0, DefaultTTL: 300, MaxTTL: 86400, ParametersInCacheKeyAndForwardedToOrigin: { CookiesConfig: { CookieBehavior: 'none' }, HeadersConfig: { HeaderBehavior: 'none' }, QueryStringsConfig: { QueryStringBehavior: 'none' }, EnableAcceptEncodingGzip: true, EnableAcceptEncodingBrotli: true } } } }
resources.ApiForwarding = { Type: 'AWS::CloudFront::OriginRequestPolicy', Properties: { OriginRequestPolicyConfig: { Name: sub('${ProjectName}-api-forward'), CookiesConfig: { CookieBehavior: 'all' }, QueryStringsConfig: { QueryStringBehavior: 'all' }, HeadersConfig: { HeaderBehavior: 'allExcept', Headers: ['host'] } } } }
resources.Distribution = { Type: 'AWS::CloudFront::Distribution', Properties: { DistributionConfig: {
    Enabled: true, HttpVersion: 'http2', IPV6Enabled: true, DefaultRootObject: 'index.html', PriceClass: 'PriceClass_All', ViewerCertificate: { CloudFrontDefaultCertificate: true },
    Origins: [
        { Id: 'frontend', DomainName: get('FrontendBucket', 'RegionalDomainName'), OriginAccessControlId: ref('OriginAccess'), S3OriginConfig: { OriginAccessIdentity: '' } },
        { Id: 'api', DomainName: get('Alb', 'DNSName'), CustomOriginConfig: { HTTPPort: 80, OriginProtocolPolicy: 'http-only', OriginReadTimeout: 120, OriginKeepaliveTimeout: 5 }, OriginCustomHeaders: [{ HeaderName: 'X-AgentVerse-Origin', HeaderValue: ref('OriginToken') }] }
    ],
    DefaultCacheBehavior: { TargetOriginId: 'frontend', ViewerProtocolPolicy: 'redirect-to-https', AllowedMethods: ['GET', 'HEAD', 'OPTIONS'], CachedMethods: ['GET', 'HEAD'], CachePolicyId: ref('StaticCache'), Compress: true },
    CacheBehaviors: [{ PathPattern: '/api/*', TargetOriginId: 'api', ViewerProtocolPolicy: 'https-only', AllowedMethods: ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE'], CachedMethods: ['GET', 'HEAD'], CachePolicyId: ref('ApiCache'), OriginRequestPolicyId: ref('ApiForwarding') }]
} } }
resources.FrontendPolicy = { Type: 'AWS::S3::BucketPolicy', Properties: { Bucket: ref('FrontendBucket'), PolicyDocument: policy([{ Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' }, Action: 's3:GetObject', Resource: sub('${FrontendBucket.Arn}/*'), Condition: { StringEquals: { 'AWS:SourceArn': sub('arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}') } } }]) } }

const secretKeys = {
    auth: ['MONGODB_URI', 'INTERNAL_SERVICE_TOKEN', 'FIREBASE_SERVICE_ACCOUNT_JSON'],
    chat: ['MONGODB_URI', 'INTERNAL_SERVICE_TOKEN'],
    agent: ['MONGODB_URI', 'INTERNAL_SERVICE_TOKEN', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'TAVILY_API_KEY', 'QDRANT_URL', 'QDRANT_API_KEY', 'POLLINATIONS_API_KEY'],
    billing: ['MONGODB_URI', 'INTERNAL_SERVICE_TOKEN', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET'],
    gateway: ['INTERNAL_SERVICE_TOKEN']
}
for (const name of serviceNames) {
    const port = { gateway: 8000, auth: 8001, chat: 8002, agent: 8003, billing: 8004 }[name]
    const environment = { NODE_ENV: 'production', PORT: String(port) }
    if (name === 'gateway') Object.assign(environment, { AUTH_SERVICE: 'http://auth:8001', CHAT_SERVICE: 'http://chat:8002', AGENT_SERVICE: 'http://agent:8003', BILLING_SERVICE: 'http://billing:8004' })
    if (name === 'agent') Object.assign(environment, { AUTH_SERVICE: 'http://auth:8001', CHAT_SERVICE: 'http://chat:8002', POLLINATIONS_IMAGE_MODEL: 'flux' })
    if (name === 'billing') environment.AUTH_SERVICE = 'http://auth:8001'
    const env = Object.entries(environment).map(([Name, Value]) => ({ Name, Value }))
    if (name === 'gateway') env.push({ Name: 'FRONTEND_URL', Value: sub('https://${Distribution.DomainName}') })
    if (name === 'agent') env.push({ Name: 'AWS_REGION', Value: ref('AWS::Region') }, { Name: 'AWS_BUCKET_NAME', Value: ref('UploadsBucketName') })
    const secrets = secretKeys[name].map(Name => ({ Name, ValueFrom: sub('${RuntimeSecretArn}:' + Name + '::') }))
    if (['auth', 'agent', 'gateway'].includes(name)) secrets.push({ Name: 'REDIS_URL', ValueFrom: ref('RedisSecret') })
    resources[name + 'Task'] = { Type: 'AWS::ECS::TaskDefinition', Properties: {
        Family: sub('${ProjectName}-' + name), RequiresCompatibilities: ['FARGATE'], NetworkMode: 'awsvpc', Cpu: name === 'agent' ? '1024' : '256', Memory: name === 'agent' ? '2048' : '512',
        RuntimePlatform: { CpuArchitecture: 'X86_64', OperatingSystemFamily: 'LINUX' }, ExecutionRoleArn: get('ExecutionRole', 'Arn'),
        ...(name === 'agent' ? { TaskRoleArn: get('AgentRole', 'Arn') } : {}),
        ContainerDefinitions: [{ Name: name, Image: sub('${AWS::AccountId}.dkr.ecr.${AWS::Region}.amazonaws.com/${ProjectName}-' + name + ':${ImageTag}'), Essential: true,
            PortMappings: [{ ContainerPort: port, Name: name + '-http', AppProtocol: 'http' }], Environment: env, Secrets: secrets,
            LogConfiguration: { LogDriver: 'awslogs', Options: { 'awslogs-group': ref('Logs'), 'awslogs-region': ref('AWS::Region'), 'awslogs-stream-prefix': name } },
            HealthCheck: { Command: ['CMD-SHELL', `node -e "fetch('http://127.0.0.1:${port}/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"`], Interval: 30, Timeout: 5, Retries: 3, StartPeriod: 90 }
        }]
    } }
    resources[name + 'Service'] = { Type: 'AWS::ECS::Service', DependsOn: ['PrivateDefaultRoute', 'Private1Association', 'Private2Association', ...(name === 'gateway' ? ['CloudFrontOnly', 'authService', 'chatService', 'agentService', 'billingService'] : name === 'billing' ? ['authService'] : name === 'agent' ? ['authService', 'chatService'] : [])], Properties: {
        Cluster: ref('Cluster'), ServiceName: name, LaunchType: 'FARGATE', PlatformVersion: 'LATEST', DesiredCount: ref('DesiredCount'), TaskDefinition: ref(name + 'Task'),
        DeploymentConfiguration: { DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MaximumPercent: 200, MinimumHealthyPercent: 100 },
        NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: 'DISABLED', SecurityGroups: [ref('TasksSecurity')], Subnets: [ref('Private1'), ref('Private2')] } },
        ServiceConnectConfiguration: { Enabled: true, Namespace: get('Namespace', 'Arn'), ...(name !== 'gateway' ? { Services: [{ PortName: name + '-http', DiscoveryName: name, ClientAliases: [{ DnsName: name, Port: port }], Timeout: { PerRequestTimeoutSeconds: 180, IdleTimeoutSeconds: 180 } }] } : {}) },
        ...(name === 'gateway' ? { HealthCheckGracePeriodSeconds: 120, LoadBalancers: [{ TargetGroupArn: ref('GatewayTargets'), ContainerName: name, ContainerPort: port }] } : {})
    } }
}
app.Outputs = {
    FrontendUrl: { Value: sub('https://${Distribution.DomainName}') },
    FrontendBucketName: { Value: ref('FrontendBucket') },
    DistributionId: { Value: ref('Distribution') },
    ClusterName: { Value: ref('Cluster') },
    AtlasAllowlistIp: { Value: sub('${NatAddress}/32'), Description: 'Add this single IP to MongoDB Atlas Network Access before starting tasks.' }
}
await mkdir(here, { recursive: true })
for (const [name, template] of [['bootstrap', bootstrap], ['stack', app]]) {
    const content = JSON.stringify(template)
    if (Buffer.byteLength(content) > 51200) throw new Error('Template exceeds direct CloudFormation upload limit')
    await writeFile(here + name + '.json', content + '\n')
    console.log(`${name}.json: ${Object.keys(template.Resources).length} resources; ${Buffer.byteLength(content)} bytes`)
}
