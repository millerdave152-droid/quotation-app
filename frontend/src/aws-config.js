import { Amplify } from 'aws-amplify';

const requiredVars = {
  REACT_APP_COGNITO_USER_POOL_ID: process.env.REACT_APP_COGNITO_USER_POOL_ID,
  REACT_APP_COGNITO_USER_POOL_CLIENT_ID: process.env.REACT_APP_COGNITO_USER_POOL_CLIENT_ID,
  REACT_APP_COGNITO_REGION: process.env.REACT_APP_COGNITO_REGION,
};

for (const [name, value] of Object.entries(requiredVars)) {
  if (!value) {
    throw new Error(`${name} is required. Check .env`);
  }
}

const awsConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.REACT_APP_COGNITO_USER_POOL_ID,
      userPoolClientId: process.env.REACT_APP_COGNITO_USER_POOL_CLIENT_ID,
      loginWith: {
        email: true
      }
    }
  }
};

Amplify.configure(awsConfig);

export default awsConfig;
