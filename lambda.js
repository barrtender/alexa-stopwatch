/**
 * This sample is a quick 
 */

'use strict';


var AWS = require("aws-sdk");
var dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

/**
 * When editing your questions pay attention to your punctuation. Make sure you use question marks or periods.
 * Make sure the first answer is the correct one. Set at least 4 answers, any extras will be shuffled in.
 */
var questions = [
    {
        "Reindeer have very thick coats, how many hairs per square inch do they have?": [
            "13,000",
            "1,200",
            "5,000",
            "700",
            "1,000",
            "120,000"
        ]
    }
];

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

        /**
         * Uncomment this if statement and populate with your skill's application ID to
         * prevent someone else from configuring a skill that sends requests to this function.
         */

//     if (event.session.application.applicationId !== "amzn1.echo-sdk-ams.app.05aecccb3-1461-48fb-a008-822ddrt6b516") {
//         context.fail("Invalid Application ID");
//      }

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
                    speechOutput = `Quit interrupting the movie Eric. Stopwatch started at ${startTime.toString()}`,
                    shouldEndSession = false;
                
                if (err) {
                    console.log(err, err.stack);
                    speechOutput = 'There was some error. Check the logs for more info';
                }

                sessionAttributes = {
                    "speechOutput": speechOutput,
                    "repromptText": speechOutput,
                    "startTime": startTime
                };
                callback(sessionAttributes,
                    buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput, shouldEndSession));
            });

}

/**
 * Handles the request to check time on a stopwatch
 * @param {session} session
 * @param {function} callback A function to call 
 */
function handleCheckRequest(session, callback) {
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
                        buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput, true));
                    return;
                } else if (data.Item === undefined) {
                    var speechOutput = 'There was no stopwatch started.';
                    callback(session.attributes,
                        buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput, true));
                    return;
                }

                var foundStartTime = data.Item.Data.S;

                var sessionAttributes = {},
                    speechOutput = `Most recent stopwatch started ${(Date.now() - foundStartTime) / 60000} minutes ago`,
                    shouldEndSession = false;
                
                sessionAttributes = {
                    "speechOutput": speechOutput,
                    "repromptText": speechOutput,
                    "startTime": foundStartTime
                };
                callback(sessionAttributes,
                    buildSpeechletResponse(CARD_TITLE, speechOutput, speechOutput, shouldEndSession));
            });
}

function handleRepeatRequest(intent, session, callback) {
    // Repeat the previous speechOutput and repromptText from the session attributes if available
    // else start a new game session
    if (!session.attributes || !session.attributes.speechOutput) {
        getWelcomeResponse(session, callback);
    } else {
        callback(session.attributes,
            buildSpeechletResponseWithoutCard(session.attributes.speechOutput, session.attributes.repromptText, false));
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
        buildSpeechletResponseWithoutCard(speechOutput, repromptText, shouldEndSession));
}

function handleFinishSessionRequest(intent, session, callback) {
    // End the session with a "Good bye!" if the user wants to quit the game
    callback(session.attributes,
        buildSpeechletResponseWithoutCard("Good bye!", "", true));
}

function isAnswerSlotValid(intent) {
    var answerSlotFilled = intent.slots && intent.slots.Answer && intent.slots.Answer.value;
    var answerSlotIsInt = answerSlotFilled && !isNaN(parseInt(intent.slots.Answer.value));
    return answerSlotIsInt && parseInt(intent.slots.Answer.value) < (ANSWER_COUNT + 1) && parseInt(intent.slots.Answer.value) > 0;
}

// ------- Helper functions to build responses -------


function buildSpeechletResponse(title, output, repromptText, shouldEndSession) {
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
        shouldEndSession: true //shouldEndSession
    };
}

function buildSpeechletResponseWithoutCard(output, repromptText, shouldEndSession) {
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
        shouldEndSession: true//shouldEndSession
    };
}

function buildResponse(sessionAttributes, speechletResponse) {
    return {
        version: "1.0",
        sessionAttributes: sessionAttributes,
        response: speechletResponse
    };
}