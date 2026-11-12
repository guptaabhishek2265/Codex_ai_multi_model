# S3 setup

Configured bucket: `cortex-ai-agent-886009424060-ap-southeast-2-an`

Region: `ap-southeast-2` (Sydney).

Generated images, PDFs, and presentations use this bucket. Objects stay private and downloads use presigned URLs. Keep S3 Block Public Access enabled. A public bucket policy and browser upload CORS rules are not required for the current server-side upload flow.

## Finish local authentication

1. In AWS Console, open IAM > Policies > Create policy > JSON.
2. Paste the contents of the adjacent `s3-policy.json` and create the policy as `AgentVerseS3Files`.
3. Create an IAM user named `agentverse-local`, or select an existing application user.
4. Attach `AgentVerseS3Files` to that user. No console login or administrator policy is needed for the application.
5. Open the user's Security credentials > Access keys > Create access key, select the local application use case, and create the key.
6. Save the access key ID and secret access key directly in this directory's `.env`:

```env
AWS_REGION=ap-southeast-2
AWS_BUCKET_NAME=cortex-ai-agent-886009424060-ap-southeast-2-an
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
AWS_SESSION_TOKEN=
```

Use `.env`, not `.env.example`. Leave the session token blank for an ordinary IAM user access key; include it if using temporary credentials. Do not paste the secret into chat or commit it. An authenticated AWS profile or deployed IAM role also works when both explicit key variables are blank.

Restart the agent service with `rs` in nodemon. S3 stores files; it does not generate images. Image generation separately requires the configured Pollinations key.

Official instructions: https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html and https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html
