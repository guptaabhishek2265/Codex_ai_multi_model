import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { parseEnv } from 'node:util'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../../', import.meta.url))
const privateDir = root + 'deployment/aws/private/'
const envFile = async path => parseEnv(await readFile(root + path, 'utf8'))
const auth = await envFile('backend/services/auth/.env')
const agent = await envFile('backend/services/agent/.env')
const billing = await envFile('backend/services/billing/.env')
const frontend = await envFile('frontend/.env')
let previous = {}
try { previous = JSON.parse(await readFile(privateDir + 'runtime-secrets.local.json', 'utf8')) } catch {}
const secrets = Object.fromEntries(['GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'TAVILY_API_KEY', 'QDRANT_URL', 'QDRANT_API_KEY', 'POLLINATIONS_API_KEY'].map(name => [name, agent[name] || '']))
Object.assign(secrets, {
    MONGODB_URI: auth.MONGODB_URI,
    INTERNAL_SERVICE_TOKEN: previous.INTERNAL_SERVICE_TOKEN || randomBytes(32).toString('hex'),
    FIREBASE_SERVICE_ACCOUNT_JSON: JSON.stringify(JSON.parse(await readFile(root + 'backend/services/auth/serviceAccountKey.json', 'utf8'))),
    RAZORPAY_KEY_ID: billing.RAZORPAY_KEY_ID || '',
    RAZORPAY_KEY_SECRET: billing.RAZORPAY_KEY_SECRET || ''
})
for (const name of ['MONGODB_URI', 'GROQ_API_KEY', 'OPENROUTER_API_KEY', 'GOOGLE_API_KEY', 'TAVILY_API_KEY', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET']) {
    if (!secrets[name]) throw new Error('Fill ' + name + ' in its local .env before preparing the deployment')
}
if (!secrets.RAZORPAY_KEY_ID.startsWith('rzp_test_')) throw new Error('This initial deployment requires Razorpay TEST credentials')
if (frontend.VITE_RAZORPAY_KEY_ID !== secrets.RAZORPAY_KEY_ID) throw new Error('Frontend and billing Razorpay key IDs must match')
const firebase = JSON.parse(secrets.FIREBASE_SERVICE_ACCOUNT_JSON)
if (frontend.VITE_FIREBASE_PROJECT_ID !== firebase.project_id) throw new Error('Frontend and backend Firebase projects must match')
let oldParameters = []
try { oldParameters = JSON.parse(await readFile(privateDir + 'parameters.local.json', 'utf8')) } catch {}
const old = name => oldParameters.find(item => item.ParameterKey === name)?.ParameterValue
const parameters = {
    ProjectName: old('ProjectName') || 'agentverse', ImageTag: old('ImageTag') || 'bootstrap', DesiredCount: old('DesiredCount') || '0',
    RuntimeSecretArn: old('RuntimeSecretArn') || '', UploadsBucketName: agent.AWS_BUCKET_NAME || '',
    OriginToken: old('OriginToken') || randomBytes(32).toString('hex')
}
if (!parameters.UploadsBucketName) throw new Error('Set AWS_BUCKET_NAME in the agent .env')
const publicEnv = Object.fromEntries(Object.entries(frontend).filter(([name]) => name.startsWith('VITE_')))
publicEnv.VITE_SERVER_URL = '' // Production uses same-origin /api calls through CloudFront.
await mkdir(privateDir, { recursive: true })
await writeFile(privateDir + 'runtime-secrets.local.json', JSON.stringify(secrets, null, 2) + '\n', { mode: 0o600 })
await writeFile(privateDir + 'parameters.local.json', JSON.stringify(Object.entries(parameters).map(([ParameterKey, ParameterValue]) => ({ ParameterKey, ParameterValue })), null, 2) + '\n', { mode: 0o600 })
await writeFile(privateDir + 'frontend-public.local.json', JSON.stringify(publicEnv, null, 2) + '\n')
console.log('Prepared ignored deployment/aws/private/*.local.json files. No credentials were printed or sent to AWS.')
console.log('Review/rotate the real credentials before uploading runtime-secrets.local.json. Never commit this directory.')
