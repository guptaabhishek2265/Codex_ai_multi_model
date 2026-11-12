# Environment setup

Six local `.env` files are provided, with matching `.env.example` templates:

| File | Purpose |
| --- | --- |
| `frontend/.env` | Public frontend configuration |
| `backend/gateway/.env` | Gateway, frontend origin, service addresses, Redis |
| `backend/services/auth/.env` | Users database and Redis sessions |
| `backend/services/chat/.env` | Conversation database |
| `backend/services/agent/.env` | AI providers, retrieval, storage, service addresses |
| `backend/services/billing/.env` | Payments, database, auth service address |

Blank values require your credentials. Local addresses are defaults, not credentials.
Actual `.env` files are ignored by Git; `.env.example` files are safe to commit.
Do not share private keys in chat; fill the local files directly.

## Credentials to supply

| Provider | Required values | Destination | Used for |
| --- | --- | --- | --- |
| Firebase web app | API key, auth domain, project ID, storage bucket, messaging sender ID, app ID | `frontend/.env`, under the corresponding `VITE_FIREBASE_*` names | Google login |
| Firebase Admin | Downloaded service-account JSON | `backend/services/auth/serviceAccountKey.json` | Verifying login tokens |
| Groq | `GROQ_API_KEY` | Agent `.env` | Chat, routing, intent classification, document content |
| OpenRouter | `OPENROUTER_API_KEY` | Agent `.env` | Coding agent |
| Google AI | `GOOGLE_API_KEY` | Agent `.env` | Image analysis and PDF embeddings |
| Tavily | `TAVILY_API_KEY` | Agent `.env` | Web search |
| Pollinations | `POLLINATIONS_API_KEY` (secret key) | Agent `.env` | Image generation; `POLLINATIONS_IMAGE_MODEL` defaults to `flux` |
| AWS | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `AWS_BUCKET_NAME` | Agent `.env` | S3 upload/download of generated files |
| Razorpay | Key ID and key secret | Billing `.env`: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Creating and verifying payments |
| Razorpay | Same public key ID as billing | `frontend/.env`: `VITE_RAZORPAY_KEY_ID` | Checkout |
| MongoDB | Connection URI, including credentials if required | Auth, chat, agent, billing `.env`: `MONGODB_URI` | Persistent data |
| Redis | Connection URL, including credentials if required | Gateway, auth, agent `.env`: `REDIS_URL` | Sessions, memory, rate limits |
| Qdrant | URL; API key for an authenticated deployment | Agent `.env`: `QDRANT_URL`, `QDRANT_API_KEY` | PDF vector retrieval |

For local MongoDB, Redis, and Qdrant using the supplied addresses, no cloud credentials are needed. The services must still be installed/running. Existing Docker Compose starts only Redis.

`AWS_SESSION_TOKEN` is optional and only applies to temporary AWS credentials. The older `AWS_SECRET_KEY` name remains supported by the code, but use `AWS_SECRET_ACCESS_KEY` for new configuration. The AWS principal needs access to upload and download objects in the chosen bucket.

No `JWT_SECRET` is needed: the application uses Redis session cookies. Image generation uses `https://gen.pollinations.ai/image/` with a server-only Pollinations secret key from `https://enter.pollinations.ai`. Provider budgets and availability apply; image generation is not guaranteed to be free. Generated images, PDFs, and presentations use S3 storage. The S3 client supports explicit env credentials or the standard AWS profile/IAM role credential chain. See `backend/services/agent/S3_SETUP.md` for the configured bucket and IAM policy.

## Firebase setup

Use one Firebase project for both the web configuration and Admin JSON. In Firebase project settings, copy the configuration for a registered web app into the frontend file. Enable the Google sign-in provider in Authentication and authorize `localhost` for local development. Download the Admin service-account private key and save it at the exact path above. That JSON is already ignored by Git; do not put it in the frontend.

## Local startup

Install dependencies with `npm ci` in `backend`, `backend/gateway`, each of the four service directories, and `frontend`. The backend root install supplies the shared Redis dependency.

Start MongoDB on port 27017, Redis on 6379, and Qdrant on 6333. Start each Node process with `npm run dev` from its own directory so dotenv finds that directory's `.env`. Use separate terminals:

| Directory | Command | Default port |
| --- | --- | --- |
| `backend/services/auth` | `npm run dev` | 8001 |
| `backend/services/chat` | `npm run dev` | 8002 |
| `backend/services/agent` | `npm run dev` | 8003 |
| `backend/services/billing` | `npm run dev` | 8004 |
| `backend/gateway` | `npm run dev` | 8000 |
| `frontend` | `npm run dev` | 5173 |

Open `http://localhost:5173`. Keep `localhost` consistent across frontend and gateway addresses. Restart services after editing env values; restart Vite after frontend changes.

All three model clients and the search tool are created during agent-service module loading, so supply all four AI-provider keys for the current full startup path, even if you only plan to use one agent initially.

To recreate a missing local file, copy the adjacent `.env.example` to `.env`. No root/backend-root `.env` is needed: neither is loaded by a standalone application process here.

## Deployment configuration

Follow [AWS_DEPLOYMENT.md](AWS_DEPLOYMENT.md) for the complete staged AWS deployment. The templates configure internal service URLs, private Redis, same-origin CloudFront API forwarding, Secrets Manager and task-role S3 access.

`INTERNAL_SERVICE_TOKEN` authenticates backend calls. It may be blank in local development but is mandatory (at least 32 characters) with `NODE_ENV=production`; use the same value in all five processes. The deployment preparation script generates it for AWS automatically.

`FIREBASE_SERVICE_ACCOUNT_JSON` supplies the full Firebase Admin JSON as a string in ECS. Local development still falls back to `backend/services/auth/serviceAccountKey.json` when this variable is unset.

The replacement GitHub workflow uses OIDC and repository **variables** `AWS_REGION`, `AWS_PROJECT_NAME`, `AWS_ROLE_ARN`, `AWS_DEPLOY_ENABLED` and the public frontend `VITE_*` settings. It reads infrastructure outputs for bucket, distribution and website addresses. Backend private credentials stay in Secrets Manager; AWS access keys are not required in GitHub. Keep `AWS_DEPLOY_ENABLED` unset/false until the first manual deployment is healthy.
