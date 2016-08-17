/**
 * This app is a quick stopwatch app
 * "Alexa start a stopwatch"
 * "Alexa ask stopwatch how long it's been" 
 * 
 * Skill list here: https://developer.amazon.com/edw/home.html#/skills/list
 * Lambda (code) goes here: https://console.aws.amazon.com/lambda/home?region=us-east-1#/functions/MyStopwatch?tab=code
 * Database here: https://console.aws.amazon.com/dynamodb/home?region=us-east-1#tables:selected=Stopwatches
 */

'use strict';


var AWS = require("aws-sdk");
var dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

/**
 * The time that the stopwatch started
 * @type {Date}
 */
var startTime;

// Route the incoming request based on type (LaunchRequest, IntentRequest,
// etc.) The JSON body of the request is provided in the event parameter.
exports.handler = function (event, context) {
    try {
        console.log("event.session.application.applicationId=" + event.session.application.applicationId);

        if (event.session.application.applicationId !== "amzn1.ask.skill.adb925d8-fff6-4a26-bd33-a9557a2a56ae") {
            context.fail("Invalid Application ID");
        }

        if (event.session.new) {
            onSessionStarted({requestId: event.request.requestId}, event.session);
        }

        if (event.request.type === "LaunchRequest") {
            onLaunch(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "IntentRequest") {
            onIntent(event.request,
                event.session,
                function callback(sessionAttributes, speechletResponse) {
                    context.succeed(buildResponse(sessionAttributes, speechletResponse));
                });
        } else if (event.request.type === "SessionEndedRequest") {
            onSessionEnded(event.request, event.session);
            context.succeed();
        }
    } catch (e) {
        context.fail("Exception: " + e);
    }
};

/**
 * Called when the session starts.
 */
function onSessionStarted(sessionStartedRequest, session) {
    console.log("onSessionStarted requestId=" + sessionStartedRequest.requestId
        + ", sessionId=" + session.sessionId);

    // add any session init logic here
}

/**
 * Called when the user invokes the skill without specifying what they want.
 * 
 */
function onLaunch(launchRequest, session, callback) {
    console.log("onLaunch requestId=" + launchRequest.requestId
        + ", sessionId=" + session.sessionId);

    getWelcomeResponse(session, callback);
}

/**
 * Called when the user specifies an intent for this skill.
 */
function onIntent(intentRequest, session, callback) {
    console.log("onIntent requestId=" + intentRequest.requestId
        + ", sessionId=" + session.sessionId);

    var intent = intentRequest.intent,
        intentName = intentRequest.intent.name;

    // handle yes/no intent after the user has been prompted
    if (session.attributes && session.attributes.userPromptedToContinue) {
        delete session.attributes.userPromptedToContinue;
        if ("AMAZON.NoIntent" === intentName) {
            handleFinishSessionRequest(intent, session, callback);
        } else if ("AMAZON.YesIntent" === intentName) {
            handleRepeatRequest(intent, session, callback);
        }
    }

    // Start stopwatch
    // Stop stopwatch
    // Check stopwatch
    // Get help
    switch(intentName){
        case "AMAZON.StartOverIntent":
            getWelcomeResponse(session, callback);
            break;
        case "AMAZON.StopIntent":
            handleFinishSessionRequest(intent, session, callback);
            break;
        case "CheckTimeIntent":
            handleCheckRequest(session, callback);
            break;
        case "AMAZON.HelpIntent":
            handleGetHelpRequest(intent, session, callback);
            break;
        default:
            throw "Invalid intent";
    }
}

/**
 * Called when the user ends the session.
 * Is not called when the skill returns shouldEndSession=true.
 */
function onSessionEnded(sessionEndedRequest, session) {
    console.log("onSessionEnded requestId=" + sessionEndedRequest.requestId
        + ", sessionId=" + session.sessionId);

    // Add any cleanup logic here
}

// ------- Skill specific business logic -------

var ANSWER_COUNT = 4;
var GAME_LENGTH = 5;
var CARD_TITLE = "Stopwatch"; // Be sure to change this for your skill.

function getWelcomeResponse(session, callback) {
    startTime = new Date();

    console.log(`session ${session.user.userId}`);
    dynamodb.putItem({
                TableName: 'Stopwatches',
                Item: {
                    CustomerId: {
                        S: session.user.userId
                    },
                    Data: {
                        S: `${startTime.getTime()}`
                    }
                }
            }, function (err, data) {
                var sessionAttributes = {},
                    // Assuming UTC -7. This means no portability but it'll work for us.
                    speechOutput = `Stopwatch started at ${(startTime.getHours() + 5) % 12} ${startTime.getMinutes()}`,
                    shouldEndSession = false;
                
                if (err) {
                    console.log(err, err.stack);
                    speechOutput = 'There was some error. Check the logs for more info';
                }
                console.log(`started stopwatch at ${startTime} for user ${session.user.userId}`);

                sessionAttributes = {
                    "speechOutput": speechOutput,
                    "repromptText": speechOutput,
                    "startTime": startTime
                };
                callback(sessionAttributes,
                    buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput));
            });

}

/**
 * Handles the request to check time on a stopwatch
 * @param {session} session
 * @param {function} callback A function to call 
 */
function handleCheckRequest(session, callback) {
    console.log(`checking stopwatch at for user ${session.user.userId}`);
    dynamodb.getItem({
                TableName: 'Stopwatches',
                Key: {
                    CustomerId: {
                        S: session.user.userId
                    }
                }
            }, function (err, data) {
                if (err) {
                    console.log(err, err.stack);
                    var speechOutput = 'An error has occurred, check the logs for more info';
                    callback(session.attributes,
                        buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput));
                    return;
                } else if (data.Item === undefined) {
                    console.log(`No stopwatch found for user ${session.user.userId}`);
                    var speechOutput = 'There was no stopwatch started.';
                    callback(session.attributes,
                        buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput));
                    return;
                }

                var foundStartTime = data.Item.Data.S;
                var minutesDiff = (Date.now() - foundStartTime) / 60000;
                var minutesAgo = Math.floor(minutesDiff);
                var secondsAgo = Math.floor(minutesDiff % 1 * 60);

                var sessionAttributes = {},
                    speechOutput = `Most recent stopwatch started ${minutesAgo} minutes and ${secondsAgo} seconds ago`,
                    shouldEndSession = false;
                
                sessionAttributes = {
                    "speechOutput": speechOutput,
                    "repromptText": speechOutput,
                    "startTime": foundStartTime
                };
                callback(sessionAttributes,
                    buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput));
            });
}

function handleRepeatRequest(intent, session, callback) {
    // Repeat the previous speechOutput and repromptText from the session attributes if available
    // else start a new game session
    if (!session.attributes || !session.attributes.speechOutput) {
        getWelcomeResponse(session, callback);
    } else {
        callback(session.attributes,
            buildSpeechletResponseWithoutCard(session.attributes.speechOutput, session.attributes.repromptText));
    }
}

function handleGetHelpRequest(intent, session, callback) {
    // Provide a help prompt for the user, explaining how a stopwatch works. Then, say current time
    // if there is one in progress, or provide the option to start another one.

    // Set a flag to track that we're in the Help state.
    session.attributes.userPromptedToContinue = true;

    // Do not edit the help dialogue. This has been created by the Alexa team to demonstrate best practices.

    var speechOutput = "I will ask you " + GAME_LENGTH + " multiple choice questions. Respond with the number of the answer. "
        + "For example, say one, two, three, or four. To start a new game at any time, say, start game. "
        + "To repeat the last question, say, repeat. "
        + "Would you like to keep playing?",
        repromptText = "To give an answer to a question, respond with the number of the answer . "
        + "Would you like to keep playing?";

    var shouldEndSession = false;
    callback(session.attributes,
        buildSpeechletResponseWithoutCard(speechOutput, repromptText));
}

function handleFinishSessionRequest(intent, session, callback) {
    // End the session with a "Good bye!" if the user wants to quit the game
    callback(session.attributes,
        buildSpeechletResponseWithoutCard("Good bye!", ""));
}

// ------- Helper functions to build responses -------


function buildSpeechletResponse(title, output, repromptText) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        card: {
            type: "Simple",
            title: title,
            content: output
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: true
    };
}

function buildSpeechletResponseWithoutCard(output, repromptText) {
    return {
        outputSpeech: {
            type: "PlainText",
            text: output
        },
        reprompt: {
            outputSpeech: {
                type: "PlainText",
                text: repromptText
            }
        },
        shouldEndSession: true
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}