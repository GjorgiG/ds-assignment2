import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client();

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));

  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const snsMessage = JSON.parse(recordBody.Message);

    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3Object = messageRecord.s3.object;
        const objectKey = decodeURIComponent(s3Object.key.replace(/\+/g, " "));
        const fileExtension = objectKey.split(".").pop()?.toLowerCase();
        const bucketName = messageRecord.s3.bucket.name;

        if (fileExtension !== "jpeg" && fileExtension !== "png") {
          console.error(`Invalid file type: ${fileExtension}`);
          continue; 
        }

        try {
          
          const timestamp = new Date().toISOString();
          await dynamodb.send(
            new PutItemCommand({
              TableName: process.env.IMAGES_TABLE_NAME,
              Item: {
                imageName: { S: objectKey },
                uploadedAt: { S: timestamp },
                status: { S: "pending_metadata" }, 
              },
            })
          );
          console.log(`Image recorded in DynamoDB: ${objectKey}`);

          
          const getObjectParams = {
            Bucket: bucketName,
            Key: objectKey,
          };
          const objectData = await s3.send(new GetObjectCommand(getObjectParams));
          console.log(`Object validated: ${objectKey}`);
        } catch (err) {
          console.error("Error writing to DynamoDB or validating object:", err);
        }
      }
    }
  }
};
