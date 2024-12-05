import * as cdk from "aws-cdk-lib";
import * as lambdanode from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as events from "aws-cdk-lib/aws-lambda-event-sources";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";

import { Construct } from "constructs";
// import * as sqs from 'aws-cdk-lib/aws-sqs';

export class EDAAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const imagesBucket = new s3.Bucket(this, "images", {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: false,
    });

     // Integration infrastructure

     const dlq = new sqs.Queue(this, "DLQ");


     const imageProcessQueue = new sqs.Queue(this, "img-created-queue", {
      receiveMessageWaitTime: cdk.Duration.seconds(5),
      deadLetterQueue: {
        maxReceiveCount: 3,
        queue: dlq,
      },
    });
  const mailerQ = new sqs.Queue(this, "mailer-queue", {
    receiveMessageWaitTime: cdk.Duration.seconds(10),
  });

  const newImageTopic = new sns.Topic(this, "NewImageTopic", {
    displayName: "New Image topic",
  }); 

  newImageTopic.addSubscription(
    new subs.SqsSubscription(imageProcessQueue)
  );

  newImageTopic.addSubscription(new subs.SqsSubscription(mailerQ));

  

  const imagesTable = new dynamodb.Table(this, "ImagesTable", {
    partitionKey: { name: "imageName", type: dynamodb.AttributeType.STRING },
    removalPolicy: cdk.RemovalPolicy.DESTROY,
    billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  });

  // Lambda functions

  const processImageFn = new lambdanode.NodejsFunction(
    this,
    "ProcessImageFn",
    {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: `${__dirname}/../lambdas/processImage.ts`,
      timeout: cdk.Duration.seconds(15),
      memorySize: 128,
    }
  );

  const mailerFn = new lambdanode.NodejsFunction(this, "mailer-function", {
    runtime: lambda.Runtime.NODEJS_16_X,
    memorySize: 1024,
    timeout: cdk.Duration.seconds(3),
    entry: `${__dirname}/../lambdas/mailer.ts`,
  });

  const logImageFn = new lambdanode.NodejsFunction(this, "LogImageFn", {
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: `${__dirname}/../lambdas/logImage.ts`,
    timeout: cdk.Duration.seconds(10),
    environment: {
      IMAGES_TABLE_NAME: imagesTable.tableName,
    },
  });

  const rejectionMailerFn = new lambdanode.NodejsFunction(this, "RejectionMailerFn", {
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: `${__dirname}/../lambdas/rejectionMailer.ts`,
    environment: {
      SES_REGION: 'eu-west-1',
      SES_EMAIL_FROM: 'gjorgievgjorgi2002@gmail.com',
      SES_EMAIL_TO: 'gjorgievgjorgi2002@gmail.com',
    },
  });

  const updateImageMetadataFn = new lambdanode.NodejsFunction(this, "UpdateImageMetadataFn", {
    runtime: lambda.Runtime.NODEJS_18_X,
    entry: `${__dirname}/../lambdas/updateImageMetadata.ts`,
    timeout: cdk.Duration.seconds(15),
    memorySize: 128,
    environment: {
      IMAGES_TABLE_NAME: imagesTable.tableName,
    },
  });

  

  const logImageEventSource = new events.SqsEventSource(imageProcessQueue, {
    batchSize: 5,
  });
  logImageFn.addEventSource(logImageEventSource);

  
const dlqEventSource = new events.SqsEventSource(dlq, {
  batchSize: 5,
});
rejectionMailerFn.addEventSource(dlqEventSource);

  // S3 --> SQS
  imagesBucket.addEventNotification(
    s3.EventType.OBJECT_CREATED,
    new s3n.SnsDestination(newImageTopic)
  );

 // SQS --> Lambda
  const newImageEventSource = new events.SqsEventSource(imageProcessQueue, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(5),
  });

  processImageFn.addEventSource(newImageEventSource);

  const newImageMailEventSource = new events.SqsEventSource(mailerQ, {
    batchSize: 5,
    maxBatchingWindow: cdk.Duration.seconds(5),
  });

  mailerFn.addEventSource(newImageMailEventSource);

  // Permissions

  newImageTopic.addSubscription(new subs.LambdaSubscription(mailerFn));
  newImageTopic.addSubscription(new subs.LambdaSubscription(updateImageMetadataFn));
  processImageFn.addEnvironment("IMAGES_TABLE_NAME", imagesTable.tableName);

  imagesBucket.grantRead(processImageFn);
  imagesTable.grantReadWriteData(updateImageMetadataFn);

  mailerFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: [
        "ses:SendEmail",
        "ses:SendRawEmail",
        "ses:SendTemplatedEmail",
      ],
      resources: ["*"],
    })
  );

  logImageFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:PutItem"],
      resources: [imagesTable.tableArn],
    })
  );

  rejectionMailerFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["ses:SendEmail", "ses:SendRawEmail"],
      resources: ["*"],
    })
  );

  processImageFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:UpdateItem"],
      resources: [imagesTable.tableArn],
    })
  );

  updateImageMetadataFn.addToRolePolicy(
    new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["dynamodb:UpdateItem"],
      resources: [imagesTable.tableArn],
    })
  );

  // Output
  
  new cdk.CfnOutput(this, "bucketName", {
    value: imagesBucket.bucketName,
  });
  }
}
