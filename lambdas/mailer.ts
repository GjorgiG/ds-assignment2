import { SQSHandler } from "aws-lambda";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";

const ses = new SESClient({ region: process.env.SES_REGION });

export const handler: SQSHandler = async (event) => {
  console.log("Event: ", JSON.stringify(event));

  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);
    const { uploadStatus, errorMessage } = recordBody;

    const toAddress = process.env.SES_EMAIL_TO;
    const fromAddress = process.env.SES_EMAIL_FROM;

    if (!toAddress || !fromAddress) {
      console.error("Email addresses are not defined in environment variables.");
      continue;
    }

    let subject = '';
    let message = '';

    if (uploadStatus === 'failure') {
      subject = "File Upload Rejected";
      message = `Your file upload was rejected due to the following reason: ${errorMessage}`;
    } else if (uploadStatus === 'success') {
      subject = "File Upload Successful";
      message = 'Your file upload was successful!';
    } else {
      console.error("Unknown upload status:", uploadStatus);
      continue;
    }

    const emailParams = {
      Destination: {
        ToAddresses: [toAddress],
      },
      Message: {
        Body: {
          Text: {
            Data: message,
          },
        },
        Subject: {
          Data: subject,
        },
      },
      Source: fromAddress,
    };

    try {
      await ses.send(new SendEmailCommand(emailParams));
      console.log(`${subject} email sent.`);
    } catch (err) {
      console.error("Error sending email:", err);
    }
  }
};
