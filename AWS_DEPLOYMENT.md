# Deploy AgentVerse to AWS, from this Windows computer

This guide matches the files in `deployment/aws/`. Run commands in **PowerShell from the repository root** unless a different location is shown. AWS infrastructure is not created merely by reading this guide or running the local tests.

## What this creates

- Five private ECS Fargate services: gateway, auth, chat, agent, billing.
- Five private ECR image repositories.
- A VPC with two public and two private subnets, one NAT gateway and a fixed outbound IP.
- A private, TLS/authenticated single-node Redis deployment in ElastiCache.
- An Application Load Balancer that accepts application traffic only with CloudFront's origin token.
- A separate private frontend S3 bucket and one CloudFront URL. `/api/*` goes to the gateway; other requests go to frontend S3.
- Secrets Manager storage, task IAM roles and CloudWatch logs.
- An optional GitHub deployment role restricted to this repository's `main` branch.

Your existing generated-files S3 bucket, MongoDB Atlas, Qdrant, Firebase and AI provider accounts remain in use. A custom domain is not required for the initial deployment.

**This is a paid architecture.** Fargate, Redis, ALB, NAT, public IPv4, Secrets Manager, logs and storage may incur charges. Setting ECS task counts to zero does not remove the other charges. Use the [AWS Pricing Calculator](https://calculator.aws/) for Sydney before creating the stack, and create [AWS budget alerts](https://docs.aws.amazon.com/cost-management/latest/userguide/budgets-create.html). Alerts do not cap or stop spending.

The initial configuration has one task per service, one Redis node and one NAT gateway. It is suitable for a first/test deployment, not a claim of high availability. Viewer connections use HTTPS; CloudFront-to-ALB uses HTTP plus a secret origin header. Before sensitive production use, configure an API domain and ACM certificate and switch the origin/listener to HTTPS, or adopt a CloudFront VPC origin. Long AI requests still have a 120-second CloudFront response window.

## 1. Prepare credentials and repository ownership

1. Use your own GitHub repository or fork. You need permission to push to its `main` branch.
2. Rotate private credentials previously shared in chat before uploading them to AWS. Update only the ignored local `.env` files. Keep Razorpay in test mode.
3. Verify Firebase's web configuration and Admin JSON are for the same project.
4. Keep the existing uploads bucket private and in `ap-southeast-2`. The current configured name is `cortex-ai-agent-886009424060-ap-southeast-2-an`.
5. Do not attach deployment-administrator permissions to the application's S3-only `agentverse-local` user. Application roles and the infrastructure deployment identity have different jobs.

## 2. Install the local tools

Install [Node.js 24](https://nodejs.org/download/release/latest-v24.x/) (choose the Windows x64 MSI), [Git for Windows](https://git-scm.com/download/win), [Docker Desktop](https://docs.docker.com/desktop/setup/install/windows-install/) with Linux containers, and the latest AWS CLI v2. The CLI's browser-login feature requires version 2.32 or newer. Follow the [official Windows AWS CLI installation instructions](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html). Open a fresh PowerShell terminal after installation.

```powershell
cd C:\Users\richa\OneDrive\Desktop\codex_ai\agentverse-ai
node --version
npm.cmd --version
git --version
docker version
aws --version
```

`docker version` must display a working server, not only a client. Open Docker Desktop if its engine is stopped.

For the checked-in PowerShell helper scripts, either use your normal authorized script policy or invoke them with a per-process policy as in the commands below. These examples do not change the machine-wide execution policy.

## 3. Authenticate the AWS CLI

Use an authorized **infrastructure deployment identity** with permission to create CloudFormation, IAM roles, ECR, ECS, VPC/NAT, ALB, ElastiCache, Secrets Manager, S3 and CloudFront resources. Your existing S3-only application key cannot create this infrastructure.

For console/browser authentication:

```powershell
aws login --profile agentverse-deploy
$env:AWS_PROFILE = 'agentverse-deploy'
$env:AWS_REGION = 'ap-southeast-2'
aws sts get-caller-identity
```

Choose the correct account in the browser and Sydney when asked for a region. Verify that the reported account owns your existing S3 bucket (the screenshots showed account `886009424060`). IAM users/roles may need the AWS-managed `SignInLocalDevelopmentAccess` policy in addition to their deployment permissions. If your organization uses IAM Identity Center, use `aws configure sso` and `aws sso login` instead. See [AWS browser-login instructions](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html).

Keep this terminal open. In a new terminal, set `AWS_PROFILE` and `AWS_REGION` again. Do not paste permanent root-account keys into files or commands.

## 4. Run local checks

Dependencies were installed during local setup. For a fresh checkout, run `npm.cmd ci` in `backend`, each service/gateway directory, and `frontend`.

```powershell
node deployment/validate.mjs
Push-Location frontend
npm.cmd run build
Pop-Location
node deployment/aws/generate-templates.mjs
```

The template generator creates `deployment/aws/bootstrap.json` and `deployment/aws/stack.json`. Their source is the readable `generate-templates.mjs` file. Regenerate them after changing that source.

## 5. Create ECR repositories and the GitHub role

First open AWS Console > IAM > Identity providers. If `token.actions.githubusercontent.com` already exists, copy its ARN. An AWS account can have only one provider with that URL; reuse it. If it does not exist, leave the variable below empty.

Replace these example GitHub values with **your own repository's** owner and name:

```powershell
$GitHubOwner = 'YOUR_GITHUB_USERNAME'
$GitHubRepository = 'YOUR_REPOSITORY_NAME'
$ExistingOidcArn = ''

aws cloudformation deploy `
  --stack-name agentverse-bootstrap `
  --template-file deployment/aws/bootstrap.json `
  --capabilities CAPABILITY_NAMED_IAM `
  --region ap-southeast-2 `
  --parameter-overrides "GitHubOwner=$GitHubOwner" "GitHubRepository=$GitHubRepository" "ExistingGitHubOidcArn=$ExistingOidcArn"
```

Wait for success. In ECR > Private repositories, verify:

```text
agentverse-auth
agentverse-chat
agentverse-agent
agentverse-billing
agentverse-gateway
```

The role uses [GitHub OIDC](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-idp_oidc.html), so GitHub does not need your AWS access-key secret. CloudFormation creates the repositories and role; it does not push your source code.

## 6. Build and push initial Docker images

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/aws/publish-images.ps1
```

The script builds Linux/AMD64 images and pushes the tag `bootstrap` into the five repositories. Existing images with that immutable tag are skipped, which makes an interrupted initial push resumable.

If you change source code and want to rebuild manually, choose a **new tag**:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/aws/publish-images.ps1 -ImageTag bootstrap2
```

Use that same tag in the stack commands below. Do not reuse `bootstrap` for different code.

## 7. Prepare and store application secrets

```powershell
node deployment/aws/prepare-config.mjs
```

This reads your existing local `.env` files and Firebase Admin JSON and writes:

```text
deployment/aws/private/runtime-secrets.local.json
deployment/aws/private/parameters.local.json
deployment/aws/private/frontend-public.local.json
```

They are ignored by Git. The runtime file contains private keys: do not commit it, print it in logs, or send it in chat. Review its values locally. No key is uploaded until you run the next command.

Create one Secrets Manager secret using the default AWS-managed encryption key:

```powershell
$SecretArn = aws secretsmanager create-secret `
  --name agentverse/runtime `
  --secret-string file://deployment/aws/private/runtime-secrets.local.json `
  --query ARN --output text --region ap-southeast-2
if ($LASTEXITCODE -ne 0) { throw 'Secret creation failed' }
```

If `agentverse/runtime` already exists, update it and retrieve its ARN instead:

```powershell
aws secretsmanager put-secret-value `
  --secret-id agentverse/runtime `
  --secret-string file://deployment/aws/private/runtime-secrets.local.json `
  --region ap-southeast-2
$SecretArn = aws secretsmanager describe-secret --secret-id agentverse/runtime --query ARN --output text --region ap-southeast-2
```

ECS injects only the keys each service needs. Redis's password and URL are generated by the infrastructure stack separately. The agent uses an ECS task role for S3; the application secret intentionally does **not** contain your local AWS access keys. See [ECS secret injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-secrets-manager.html).

## 8. Create the application infrastructure with tasks stopped

This is the step that creates ongoing-charge resources. Check your AWS budget and selected account before running it.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/aws/deploy-stack.ps1 `
  -RuntimeSecretArn $SecretArn -DesiredCount 0
```

If you used `bootstrap2` in step 6, append `-ImageTag bootstrap2`.

In AWS Console > CloudFormation, open `agentverse-app` > Events to watch progress. Wait for `CREATE_COMPLETE`. The script also waits and displays these outputs:

| Output | What to do with it |
| --- | --- |
| `AtlasAllowlistIp` | Add to MongoDB Atlas Network Access |
| `FrontendUrl` | Authorize its hostname in Firebase; this is the website URL |
| `FrontendBucketName` | Frontend publishing destination; separate from generated files |
| `DistributionId` | CloudFront cache invalidation |
| `ClusterName` | ECS cluster name |

CloudFront and Redis creation can take time. Do not re-run creation while the stack is still changing. `DesiredCount=0` deliberately means the API is not healthy yet.

## 9. Allow AWS to access MongoDB Atlas

1. Open MongoDB Atlas and select your existing project.
2. Open Security > Network Access > Add IP address.
3. Paste **exactly** the `AtlasAllowlistIp` output, including `/32`.
4. Give it a comment such as `AgentVerse AWS NAT` and confirm.
5. Wait until the access-list entry is active.

This static NAT address is shared by all private backend tasks. Keep your local-development IP entry if you still use the app locally. Do not solve connectivity by opening the database to every IP. The configured database user needs access to the `agentverse` database. Billing credit transactions require a replica set; MongoDB Atlas provides one.

## 10. Authorize the AWS frontend in Firebase

1. Copy `FrontendUrl`, for example `https://d123example.cloudfront.net`.
2. Open Firebase Console > Authentication > Settings > Authorized domains.
3. Add only its hostname: `d123example.cloudfront.net`.
4. Keep Google enabled under Sign-in method.

The frontend Firebase settings still point to your existing Firebase project. Do not enter the CloudFront hostname as `VITE_FIREBASE_AUTH_DOMAIN`; authorize it in Firebase instead.

## 11. Start all five backend services

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/aws/deploy-stack.ps1 -DesiredCount 1
```

Again pass `-ImageTag bootstrap2` if that was the tag you published. The saved ARN is reused.

Open AWS Console > ECS > Clusters > `agentverse` > Services. Each service should reach one running task. Internal addresses (`auth:8001`, `chat:8002`, etc.) are provided by [ECS Service Connect](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-connect.html). You do not manually enter container IP addresses.

Open `FrontendUrl/api/health`. It should return:

```json
{"ready":true}
```

Until frontend publishing, the root website may still return S3 access denied. That does not mean the API stack failed.

## 12. Publish the frontend

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File deployment/aws/publish-frontend.ps1
```

This loads the public Firebase/Razorpay settings, builds React, uploads `frontend/dist` to the **frontend bucket only**, and invalidates CloudFront. It sets the API URL to the same CloudFront origin. It does not upload backend secrets.

Open the `FrontendUrl` in a browser. If you see old content, wait for CloudFront invalidation to finish and hard-refresh. Keep both S3 buckets' Block Public Access enabled. The frontend bucket is served through [CloudFront Origin Access Control](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-s3.html).

## 13. Test the AWS website

1. Continue with Google and sign in. Refresh; login should persist.
2. Create a conversation and send a short chat question.
3. Ask an educational question and check that signed S3 images load.
4. Generate a code example.
5. Upload a PDF and check document-specific reading.
6. Generate/download a PDF and presentation.
7. Open Billing and make a **Razorpay test payment**. Confirm the test order in Razorpay and updated app credits.
8. Sign out and back in. Try a second account and confirm it cannot access the first account's conversation IDs.

Do not switch to real-money keys as part of this initial deployment. Credit packs are one-time payments, not recurring subscriptions. The callback flow supports retry-safe grants, but automated webhook reconciliation for interrupted browser checkouts is a separate production enhancement.

## 14. Enable automatic deployment from GitHub

First commit the reviewed source and deployment files to your own repository. Check `git status` carefully: `.env`, Admin JSON, `deployment/aws/private/`, and temporary uploaded PDFs must not be staged. The project includes ignore rules for these files.

If the existing `origin` belongs to someone else, fork the repository in GitHub first and point your local remote to your fork:

```powershell
git remote -v
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/YOUR_REPOSITORY_NAME.git
git status
git add backend frontend deployment .github README.md ENVIRONMENT.md AWS_DEPLOYMENT.md .gitignore
git diff --cached --name-only
git commit -m "Prepare AWS ECS deployment"
git push origin HEAD:main
```

Replace the remote example before running it; keep the existing remote if it already points to your own repository. Use the same GitHub owner/name you supplied to the bootstrap stack. If Git rejects a non-fast-forward push, synchronize your own branch and resolve differences; do not force-push over remote work.

Retrieve the GitHub deploy role ARN:

```powershell
aws cloudformation describe-stacks --stack-name agentverse-bootstrap `
  --query "Stacks[0].Outputs[?OutputKey=='GitHubRoleArn'].OutputValue" --output text --region ap-southeast-2
```

In GitHub > your repository > Settings > Secrets and variables > Actions > **Variables**, add:

| Variable | Value |
| --- | --- |
| `AWS_REGION` | `ap-southeast-2` |
| `AWS_PROJECT_NAME` | `agentverse` |
| `AWS_ROLE_ARN` | The role ARN output above |
| `AWS_DEPLOY_ENABLED` | `true` only after manual deployment works |
| `VITE_FIREBASE_API_KEY` | Same public Firebase value as frontend `.env` |
| `VITE_FIREBASE_AUTH_DOMAIN` | Same public Firebase value |
| `VITE_FIREBASE_PROJECT_ID` | Same public Firebase value |
| `VITE_FIREBASE_STORAGE_BUCKET` | Same public Firebase value |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Same public Firebase value |
| `VITE_FIREBASE_APP_ID` | Same public Firebase value |
| `VITE_RAZORPAY_KEY_ID` | Your Razorpay **test** public key ID |

Private AI keys, MongoDB passwords, Firebase Admin JSON, Razorpay secret and AWS access keys do **not** go in these frontend variables. Backend keys stay in Secrets Manager. Remove obsolete long-lived AWS deployment secrets from the old workflow once the OIDC pipeline is verified.

Push to `main` or open Actions > Deploy AgentVerse to AWS > Run workflow. The role trusts `main`, so manual runs must also select that branch. If you renamed or transferred the repository, update the bootstrap stack's GitHub owner/name parameters first.

The workflow runs checks, publishes immutable Git-SHA-tagged images, deploys services in dependency order, waits for ECS health, builds/publishes the frontend and checks the public API. It detects circuit-breaker rollbacks. It does not create or delete your network infrastructure.

For later infrastructure updates, pass the **currently deployed image tag** to `deploy-stack.ps1 -ImageTag <git-sha> -DesiredCount 1`; otherwise an old bootstrap tag may be restored by CloudFormation. Do not run an infrastructure update concurrently with a GitHub deployment.

## 15. Update runtime credentials later

Update local `.env` values, regenerate the ignored runtime file, and use `secretsmanager put-secret-value` from step 7. Then force a new deployment for every affected service:

```powershell
foreach ($serviceName in @('auth', 'chat', 'agent', 'billing', 'gateway')) {
  aws ecs update-service --cluster agentverse --service $serviceName --force-new-deployment --region ap-southeast-2
}
```

ECS reads injected secrets when a new task starts, not continuously. Preserve `INTERNAL_SERVICE_TOKEN` across a routine key update; the preparation script reuses it. Rotating that shared token requires a coordinated rollout because old and new task versions otherwise reject each other.

## Troubleshooting

| Symptom | Where to look / likely cause |
| --- | --- |
| CLI AccessDenied | Wrong identity/profile, or S3-only app user used for infrastructure |
| Bootstrap says OIDC provider exists | Re-run with `ExistingGitHubOidcArn` set to the existing provider ARN |
| ECS tasks stop immediately | ECS stopped-task reason and CloudWatch `/ecs/agentverse`; missing secret key, malformed Firebase JSON, MongoDB access list, Redis or service token |
| Secret cannot be fetched | Runtime ARN region/account, execution role permissions; use default Secrets Manager encryption unless you add custom KMS access |
| Fargate resource limit | Service Quotas > AWS Fargate; this stack initially uses two vCPUs plus rolling deployment headroom |
| CloudFormation rollback | Open its Events tab and inspect the first resource failure; do not keep pushing new images |
| Direct ALB URL gives 403 | Expected: origin-token listener rule admits CloudFront traffic |
| Website root gives 403 | Frontend files not uploaded or OAC bucket policy still propagating |
| API health 503 | Gateway Redis connection not ready |
| API requests 502/504 | ECS targets, private service discovery, health, or synchronous AI processing exceeded CloudFront's timeout |
| Google unauthorized domain | Add CloudFront hostname in Firebase Authentication settings |
| Login works then disappears | Wrong production API URL, wrong frontend origin, or cookie forwarding/cache configuration was changed |
| Checkout fails | Test/live mismatch, missing frontend build key, billing service or auth credit ledger unavailable |
| Signed picture stops loading later | Signed S3 URLs currently expire; requesting a new illustrated response creates fresh links |

The helpers require Windows PowerShell and AWS CLI. GitHub uses its own Linux deployment helper. Local AWS profiles are not included in images.

## Stop or remove the deployment

To stop application tasks temporarily, use `deploy-stack.ps1 -DesiredCount 0 -ImageTag <current-tag>`. Redis, NAT, ALB, public IPv4 and other retained resources can still cost money.

To remove the deployment, first disable the GitHub `AWS_DEPLOY_ENABLED` variable, then delete `agentverse-app` in CloudFormation. This removes its running infrastructure. The frontend bucket is deliberately retained, Redis creates a final snapshot, and the bootstrap ECR repositories are retained. Those resources can continue to incur storage charges. Review them separately before deleting data. Your existing generated-files bucket, externally created runtime secret, Atlas and Qdrant are not deleted by this stack.

If you also delete `agentverse-bootstrap`, check which OIDC provider it created or reused before deleting IAM resources used by any other project. Deleting the app stack removes its NAT IP, so remove that stale IP from Atlas afterward.

## Validation scope

Local regression tests, frontend builds and CloudFormation schema linting can be performed without creating AWS resources. They do not prove an AWS deployment has succeeded. Check actual CloudFormation/ECS health and perform the browser tests above after creating your stack. Application data, keys and payment details must remain out of source control and logs.
