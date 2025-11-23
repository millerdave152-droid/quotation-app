import { Amplify } from 'aws-amplify';

const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: 'us-east-1_zVwdcwyd6',
      userPoolClientId: '6hlmq4tl68blnjge1339ii1akk',
      loginWith: {
        email: true
      }
    }
  }
};

Amplify.configure(awsConfig);

export default awsConfig;