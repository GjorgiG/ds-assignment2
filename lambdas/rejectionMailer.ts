import { SQSHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.SES_REGION });

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    console.log("Parsed record body:", recordBody); 
    const errorMessage = recordBody.errorMessage;
    console.log("Error message:", errorMessage);

   
    const toAddress = process.env.SES_EMAIL_TO;
    const fromAddress = process.env.SES_EMAIL_FROM;

    if (!toAddress || !fromAddress) {
      console.error("Email addresses are not defined in environment variables.");
      continue;
    }

    const emailParams = {
      Destination: {
        ToAddresses: [toAddress],
      },
      Message: {
        Body: {
          Text: {
            Data: `Your file upload was rejected due to the following reason: Invalid file type`,
          },
        },
        Subject: {
          Data: "File Upload Rejected",
        },
      },
      Source: fromAddress,
    };

    try {
      await ses.send(new SendEmailCommand(emailParams));
      console.log("Rejection email sent.");
    } catch (err) {
      console.error("Error sending email:", err);
    }
  }
};
