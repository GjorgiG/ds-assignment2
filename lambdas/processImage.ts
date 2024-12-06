import { SQSHandler } from "aws-lambda";
import { DynamoDBClient, PutItemCommand, DeleteItemCommand } from "@aws-sdk/client-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { SES_EMAIL_FROM, SES_EMAIL_TO, SES_REGION } from "../env";

const dynamodb = new DynamoDBClient({});
const s3 = new S3Client({});
const ses = new SESClient({ region: SES_REGION });

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

        // handles delete objects
        if (eventName === "ObjectRemoved:Delete") {
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

        const fileExtension = objectKey.split(".").pop()?.toLowerCase();

        // validate file extensions
        if (fileExtension !== "jpeg" && fileExtension !== "png") {
          console.error(`Invalid file type: ${fileExtension}`);
          await sendFailureEmail(`Invalid file type: ${fileExtension}`);
          continue;
        }

        try {
          const s3Object = await s3.send(
            new GetObjectCommand({
              Bucket: bucketName,
              Key: objectKey,
            })
          );
          const contentType = s3Object.ContentType;
          if (contentType !== "image/jpeg" && contentType !== "image/png") {
            console.error(`Invalid content type: ${contentType}`);
            await sendFailureEmail(`Invalid content type: ${contentType}`);
            continue;
          }

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
          console.error("Error processing image:", err);
          await sendFailureEmail(`Failed to process image: ${objectKey}`);
        }
      }
    }
  }
};

// sends failure email
const sendFailureEmail = async (message: string) => {
  if (!SES_EMAIL_TO || !SES_EMAIL_FROM) {
    console.error("Email addresses are not set in environment variables.");
    return;
  }

  const emailParams = {
    Destination: {
      ToAddresses: [SES_EMAIL_TO],
    },
    Message: {
      Body: {
        Text: {
          Data: `Your file upload was rejected due to the following reason: ${message}`,
        },
      },
      Subject: {
        Data: "File Upload Rejected",
      },
    },
    Source: SES_EMAIL_FROM,
  };

  try {
    await ses.send(new SendEmailCommand(emailParams));
    console.log("Failure email sent.");
  } catch (err) {
    console.error("Error sending failure email:", err);
  }
};
