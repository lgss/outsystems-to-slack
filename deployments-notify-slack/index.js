const AWS = require('aws-sdk');
AWS.config.update({region: 'eu-west-2'});
var format = require('date-fns/format');
var parse = require('date-fns/parse');
var distanceInWordsToNow = require('date-fns/distance_in_words_to_now');   
var rp = require('request-promise-native');

exports.handler = function(event, context, callback) {
  console.log(JSON.stringify(event,null,2));
  try {
    var deploymentId = JSON.parse(event.Records[0].Sns.Message).deploymentKey;
  } catch(e) {
    var deploymentId = event.Records[0].Sns.Message.deploymentKey;
  }

  var slackProps = {};

  if(deploymentId) {
    // http request options
    var options = {
        uri: `${process.env.OS_LIFETIME_URL}/lifetimeapi/rest/v1/deployments/${deploymentId}`,
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization': process.env.OS_SERVICE_ACCOUNT_KEY
        },
        json: true
    };

    rp(options).then((data) => {
      console.log(JSON.stringify(data,null,2));
      var sourceId = data.Deployment.SourceEnvironmentKey;
      var targetId = data.Deployment.TargetEnvironmentKey;

      slackProps.createdBy = data.Deployment.CreatedBy;
      slackProps.startedBy = data.Deployment.StartedBy;
      slackProps.createdOn = distanceInWordsToNow(parse(data.Deployment.CreatedOn),{addSuffix: true, includeSeconds:true});
      slackProps.startedOn = distanceInWordsToNow(parse(data.Deployment.StartedOn),{addSuffix: true, includeSeconds:true});
      slackProps.notes = data.Deployment.Notes;

      // get the source and target environment details
      var srcoptions = {
        uri: `${process.env.OS_LIFETIME_URL}/lifetimeapi/rest/v1/environments/${sourceId}`,
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization': process.env.OS_SERVICE_ACCOUNT_KEY
        },
        json: true
      };

      var trgtoptions = {
        uri: `${process.env.OS_LIFETIME_URL}/lifetimeapi/rest/v1/environments/${targetId}`,
        headers: {
            'User-Agent': 'Request-Promise',
            'Authorization': process.env.OS_SERVICE_ACCOUNT_KEY
        },
        json: true
      };

      var slackOptions = {
        uri: process.env.SLACK_HOOK_URL,
        method: 'POST',
        headers: {
            'User-Agent': 'OS-SLACK-HOOK'
        },
        json: true
      };

      // go fetch everything and send a message
      // get source env
      rp(srcoptions).then((data) => {
        slackProps.from = data.Name;
      }).then(() => {
        return rp(trgtoptions); // get target env
      }).then((data) => {
        slackProps.to = data.Name;
      }).then(() => {

        slackOptions.body = {
          "attachments": [
              {
                  "fallback": `Deployment from ${slackProps.from} to ${slackProps.to}`,
                  "color": "#36a64f",
                  "author_name": slackProps.createdBy,
                  "title": `Deployment from ${slackProps.from} to ${slackProps.to}`,
                  "text": `A new Outsystems deployment has been created. You can check progress in <${process.env.OS_LIFETIME_URL}/lifetime/Applications.aspx|Lifetime> :tada:`,
                  "fields": [
                      {
                          "title": "Created",
                          "value": (slackProps.createdOn) ? slackProps.createdOn : 'n/a',
                          "short": true
                      },{
                          "title": "Started",
                          "value": (slackProps.startedOn) ? slackProps.startedOn : 'n/a',
                          "short": true
                      },
                      {
                          "title": "Notes",
                          "value": slackProps.notes.length > 0 ? slackProps.notes : 'No deployment notes supplied',
                          "short": false
                      }
                  ],
                  "footer": "Outsystems to Slack by LGSS Digital",
                  "footer_icon": "https://www.outsystems.com/CommunityBaseTheme/img/social_share_thumbs_200x200.png",
              }
          ]
      }
        return rp(slackOptions); // send to slack
      }).then((data) => {
        callback(null,{success:true})
      }).catch((err) => {
        callback(err,{success:false});
      });

    }).catch((err) => {
      callback(err,{success:false});
    });

  } else {
    callback("No deployment id given.",{success:false});
  }
};