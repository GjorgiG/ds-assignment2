import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const dynamodb = new DynamoDBClient({});

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const snsMessage = JSON.parse(recordBody.Message);

    if (snsMessage.Records) {
      for (const messageRecord of snsMessage.Records) {
        const s3Object = messageRecord.s3.object;
        const objectKey = decodeURIComponent(s3Object.key.replace(/\+/g, " "));  // this decodes it to handle special characters
        const fileExtension = objectKey.split(".").pop()?.toLowerCase();

        // only allows jpeg and png
        if (fileExtension !== "jpeg" && fileExtension !== "png") {
          throw new Error(`Invalid file type: ${fileExtension}`);
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
          console.log(`Image recorded: ${objectKey}`);
        } catch (err) {
          console.error("Error writing to DynamoDB:", err);
          throw err;
        }
      }
    }
  }
};
