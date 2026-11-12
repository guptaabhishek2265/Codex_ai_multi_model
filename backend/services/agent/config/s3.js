import "dotenv/config";
import { S3Client} from "@aws-sdk/client-s3";

const accessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const secretAccessKey = (process.env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_KEY)?.trim();

export const s3=new S3Client({
    region:process.env.AWS_REGION,
    // Fall back to the SDK credential chain for AWS profiles and deployed IAM roles.
    ...(accessKeyId && secretAccessKey ? { credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken:process.env.AWS_SESSION_TOKEN || undefined
    }} : {}),
    maxAttempts: 3
})

export const checkS3Configuration = async () => {
    if (!process.env.AWS_REGION?.trim() || !process.env.AWS_BUCKET_NAME?.trim()) {
        const error = new Error('Set AWS_REGION and AWS_BUCKET_NAME in the agent service .env.');
        error.code = 'S3_CONFIGURATION';
        throw error;
    }
    try {
        if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) throw new Error('Incomplete credentials');
        await s3.config.credentials();
    } catch {
        const error = new Error('S3 credentials are missing. Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in the agent service .env, or configure an AWS profile/IAM role.');
        error.code = 'S3_CONFIGURATION';
        throw error;
    }
};
