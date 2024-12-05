import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, DeleteItemCommand, PutItemCommand } from "@aws-sdk/client-dynamodb";
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
        const { eventName, s3: s3Event } = messageRecord;
        const objectKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, " "));
        const bucketName = s3Event.bucket.name;

        if (eventName === "ObjectRemoved:Delete") {
          // Handle DeleteObject event
          try {
            await dynamodb.send(
              new DeleteItemCommand({
                TableName: process.env.IMAGES_TABLE_NAME,
                Key: { imageName: { S: objectKey } },
              })
            );
            console.log(`Image deleted from DynamoDB: ${objectKey}`);
          } catch (err) {
            console.error("Error deleting from DynamoDB:", err);
          }
          continue;
        }

        // Handle ObjectCreated event
        const fileExtension = objectKey.split(".").pop()?.toLowerCase();
        if (fileExtension !== "jpeg" && fileExtension !== "png") {
          console.error(`Invalid file type: ${fileExtension}`);
          continue;
        }

        try {
          await dynamodb.send(
            new PutItemCommand({
              TableName: process.env.IMAGES_TABLE_NAME,
              Item: {
                imageName: { S: objectKey },
              },
            })
          );
          console.log(`Image recorded in DynamoDB: ${objectKey}`);
        } catch (err) {
          console.error("Error writing to DynamoDB:", err);
        }
      }
    }
  }
};

