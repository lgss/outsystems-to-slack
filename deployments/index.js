// TODO: Set up SLACK integration

const AWS = require('aws-sdk');
AWS.config.update({region: 'eu-west-2'}); // ONLY IRELAND HAS ACCESS TO SEND EMAIL AND SMS, LONDON DOESNT
var format = require('date-fns/format');

var rp = require('request-promise-native');
var dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
var sns = new AWS.SNS({apiVersion: '2012-08-10'});
const DEPLOYMENT_TABLE_NAME = process.env.DEPLOYMENT_TABLE_NAME;
// checks 
exports.handler = function(event, context, callback) {
  
    // http request options
    var options = {
        uri: process.env.OS_LIFETIME_URL + '/lifetimeapi/rest/v1/deployments?',//MinDate=' + format(new Date(), 'YYYY-MM-DD'),
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization': process.env.OS_SERVICE_ACCOUNT_KEY
        },
        json: true // Automatically parses the JSON string in the response
    };

    // hit OS REST API for environments
    rp(options).then(function (data) {
      console.log(data);
      data.forEach(env => {
        console.log('Deployment %s is from %s to %s',env.Key,env.SourceEnvironmentKey, env.TargetEnvironmentKey);  
        
        // check if deployment is in the table already
        var docClient = new AWS.DynamoDB.DocumentClient()
        var params = {
          TableName: DEPLOYMENT_TABLE_NAME,
          Key:{
              "id": env.Key
          }
        };
        
        // check if item is in the db
        var dbClientPromise = docClient.get(params).promise();
        dbClientPromise.then(function(deployment) {
          if(!deployment.Item) {
            // item doesn't exist, put it in the database
            var params = {
              TableName: DEPLOYMENT_TABLE_NAME,
              Item:{
                  "id": env.Key
              }
            };
            var dbPut = docClient.put(params).promise();
            dbPut.then(function(data){
              console.log("Added item:", JSON.stringify(data, null, 2));

              // publish to SNS
              var payload = {
                default:'Outsystems deployment created',
                lambda: {
                  deploymentKey: env.Key
                }
              };
              
              // stringify inner objects
              payload.lambda = JSON.stringify(payload.lambda);
              payload = JSON.stringify(payload);

              var params = {
                Message: payload, /* required */
                MessageStructure: 'json',
                Subject: 'Outsystems Deployment Notification',
                TopicArn: process.env.SNS_TOPIC
              };
              var snsPromise = sns.publish(params).promise();

            }).catch(function(err){
              console.log(err);
            });
          } else { 
            //console.log('Item exists: %s',env.Key);
          }

        }).catch(function(err) {
          console.log(err,err);
        });
      }); // end loop
      callback(null,'Deployments notifications sent.');
    })
    .catch(function (err) {
        console.log('API call failed');
        callback(err,'API call failed');
    }); 
};