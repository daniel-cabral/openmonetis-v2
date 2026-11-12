// Optional operator check (--check-bucket): HEAD each attachment key. No other S3 call.
import { HeadObjectCommand, S3Client, S3ServiceException } from "@aws-sdk/client-s3";
import type { Finding, V1Attachment } from "../types";

const RULE = "attachment.missing-object";
const NOT_FOUND_STATUS = 404;

export async function checkBucketKeys(attachments: V1Attachment[]): Promise<Finding[]> {
  if (attachments.length === 0) return [];
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error("--check-bucket needs S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY.");
  }
  const endpoint = process.env.S3_ENDPOINT?.trim() || undefined;
  const client = new S3Client({
    endpoint,
    region: process.env.S3_REGION?.trim() || "us-east-1",
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint),
  });

  const findings: Finding[] = [];
  try {
    for (const attachment of attachments) {
      try {
        await client.send(new HeadObjectCommand({ Bucket: bucket, Key: attachment.chave_arquivo }));
      } catch (error) {
        if (
          !(error instanceof S3ServiceException) ||
          error.$metadata.httpStatusCode !== NOT_FOUND_STATUS
        ) {
          throw error;
        }
        findings.push({
          rule: RULE,
          severity: "informational",
          table: "anexos",
          v1Id: attachment.id,
          v1UserId: attachment.user_id,
          reason: "attachment file not found in the bucket",
          context: {},
          resolutions: [],
          resolutionKey: `${RULE}:anexos:${attachment.id}`,
        });
      }
    }
  } finally {
    client.destroy();
  }
  return findings;
}
