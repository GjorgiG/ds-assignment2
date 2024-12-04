import { SNSHandler } from "aws-lambda";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const dynamoDb = new DynamoDBClient({ region: "eu-west-1" });

export const handler: SNSHandler = async (event) => {
  console.log("Received event: ", JSON.stringify(event));

  for (const record of event.Records) {
    const snsMessage = JSON.parse(record.Sns.Message); 
    const metadataType = record.Sns.MessageAttributes?.metadata_type?.StringValue;
    const imageId = snsMessage.id;
    const value = snsMessage.value;

    console.log("Metadata Type: ", metadataType);
    console.log("Image ID: ", imageId);
    console.log("Metadata Value: ", value);

    // Check if the metadata type is valid
    if (["Caption", "Date", "Photographer"].includes(metadataType)) {
      // Prepare the update parameters for DynamoDB
      const updateParams = {
        TableName: process.env.IMAGES_TABLE_NAME!, 
        Key: {
          imageName: { S: imageId },
        },
        UpdateExpression: "SET metadata.#type = :value", 
        ExpressionAttributeNames: {
          "#type": metadataType, 
        },
        ExpressionAttributeValues: {
          ":value": { S: value },
        },
      };

      try {
        await dynamoDb.send(new UpdateItemCommand(updateParams));
        console.log(`Successfully updated metadata for image ${imageId}`);
      } catch (error) {
        console.error("Error updating DynamoDB:", error);
      }
    } else {
      console.log(`Invalid metadata type: ${metadataType}`);
    }
  }
};
