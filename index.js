define( function( require ) {

    'use strict';
    
    var Postmonger = require( 'postmonger' );
    var $ = require( 'jquery.min' );

    var connection = new Postmonger.Session();
    var activityData = {};
    var journeyData = {};
    var schema = {};

    var steps = [ // initialize to the same value as what's set in config.json for consistency
        { "label": "Step 1", "key": "step1" },
        { "label": "Step 2", "key": "step2" }
    ];
    var currentStep = steps[0].key;
    var activityName = undefined;
    var activityNamePrefix = "Wavy Message";
    var dataExtensionWarningSelector = '#glo-data-extension-warning';
    var placeholderListSelector = '#glo-placeholder-list';
    var phoneSelector = '#glo-phone-parameter';
    var emailSelector = '#glo-email-parameter';
    var destinationSelector = '#glo-destination-parameter'; 
    var phoneSelectorValue = undefined;
    var emailSelectorValue = undefined;

    var messageTemplateSelector = '#glo-message-template-input';


    $(window).ready(onRender);

    connection.on('initActivity', onInitActivity);
    connection.on('requestedSchema', onRequestedSchema);
    connection.on('requestedInteraction', onRequestedInteraction);
    
    connection.on('requestedTokens', onGetTokens);
    connection.on('requestedEndpoints', onGetEndpoints);

    connection.on('clickedNext', onClickedNext);
    connection.on('clickedBack', onClickedBack);
    connection.on('gotoStep', onGotoStep);

    //on click in edit activity
    function onRender() {
        // JB will respond the first time 'ready' is called with 'initActivity'
        connection.trigger('ready');
        connection.trigger('requestSchema');
        connection.trigger('requestInteraction');
        connection.trigger('requestTokens');
        connection.trigger('requestEndpoints');

        
        $(messageTemplateSelector).change(function() {
            onInputChange();
            //to show in other step
        });

        onInputChange();

        console.log("on render");
    }

    // Disable the next button if a value isn't selected
    function onInputChange() {
        var validInput = isValidInput();
        connection.trigger('updateButton', { button: 'next', enabled: validInput });
        console.log("input change");
    }

    //next to OnRender
    function onInitActivity (data) {
        if (data) {
            activityData = data;
            activityName = activityData.name;
        }

        var messageTemplate;
        var hasInArguments = Boolean(
            activityData['arguments'] &&
            activityData['arguments'].execute &&
            activityData['arguments'].execute.inArguments &&
            activityData['arguments'].execute.inArguments.length > 0
        );

        var inArguments = hasInArguments ? activityData['arguments'].execute.inArguments : {};

        $.each(inArguments, function(index, inArgument) {
            $.each(inArgument, function(key, val) {
                if (key === 'messageTemplate') {
                    messageTemplate = val;
                } else  if (key === 'phone') {
                    phoneSelectorValue = val;
                } else if (key === 'email') {
                    emailSelectorValue = val;
                }
            });
        });

        //Set saved values in Activity
        if (messageTemplate) {
            $(messageTemplateSelector).val(messageTemplate);
        }
        if (phoneSelectorValue) {
            $(phoneSelector).val(phoneSelectorValue);
        }
        if (emailSelectorValue) {
            $(emailSelector).val(emailSelectorValue);
        }


        showStep(null, 1);
        connection.trigger('updateButton', { button: 'next', enabled: isValidInput() });

        console.log("on input activity");
    }

    //to get Entry Source in Journey
    function onRequestedSchema (data) {
        schema = data['schema'];
        var schemaPresent = schema !== undefined && schema.length > 0;
        $(dataExtensionWarningSelector).toggle(!schemaPresent);

        fillPlaceholderList(schema);
        fillPhoneCombobox(schema);
        fillEmailCombobox(schema);
        connection.trigger('updateButton', { button: 'next', enabled: isValidInput() });
        console.log('onRequestedSchema-data',data);
    }

    //to set Activity Name
    function onRequestedInteraction(data) {
        journeyData = data;
        activityName = getActivityName();
        console.log('onRequestedInteraction-data',journeyData);
    }

    function onGetTokens (tokens) {
        //Response: tokens = { token: <legacy token>, fuel2token: <fuel api token> }
        console.log('TOKENS ' + tokens);
    }

    function onGetEndpoints (endpoints) {
        //Response: endpoints = { restHost: <url> } i.e. "rest.s1.qa1.exacttarget.com"
        console.log('Endpoints ' + endpoints);
    }

    function onClickedNext () {
        if (currentStep.key === 'step2') {
            save();
        } else {
            connection.trigger('nextStep');
        }

        console.log("click next");
    }

    function onClickedBack () {
        console.log("Click back");
        connection.trigger('prevStep');
    }

    function onGotoStep (step) {
        console.log("Go to step");
        showStep(step);
        connection.trigger('ready');
    }

    function showStep(step, stepIndex) {
        console.log("Show step");
        if (stepIndex && !step) {
            step = steps[stepIndex-1];
        }

        currentStep = step;

        $('.step').hide();

        switch(currentStep.key) {
            case 'step1':
                $('#step1').show();
                connection.trigger('updateButton', {
                    button: 'next',
                    text: 'Next',
                    enabled: isValidInput() 
                });
                connection.trigger('updateButton', {
                    button: 'back',
                    visible: false
                });
                break;
            case 'step2':
                $('#step2').show();
                connection.trigger('updateButton', {
                    button: 'back',
                    visible: true
                });
                connection.trigger('updateButton', {
                    button: 'next',
                    text: 'Done',
                    visible: true
                });
                break;
        }
    }

    function save() {
        console.log("Save");
        activityData.name = getActivityName();
        configureInArguments();
        configureOutArguments();

        activityData['metaData'].isConfigured = true;
        connection.trigger('updateActivity', activityData);
    }

    function configureInArguments() {
        console.log("Configure in arguments");
        var inArguments = [];
        if (schema !== undefined && schema.length > 0) {
            for (var i in schema) {
                var field = schema[i];
                if (isEventDataSourceField(field)) {
                    var fieldName = extractFieldName(field);
                    var prefixedFieldName = 'com.globant.event.data.' + fieldName;
                    saveFieldToInArguments(field, prefixedFieldName, inArguments);
                }
            }
        }
        inArguments.push({ "messageTemplate": getMessageTemplate() });
        inArguments.push({ "phone": getPhone() });
        inArguments.push({ "email": getEmail() });
        inArguments.push({ 'activityName': activityName });
        
        activityData['arguments'].execute.inArguments = inArguments;
    }

    function configureOutArguments() {
        console.log("Configure out arguments");
        var outArguments = [];
        outArguments.push(createOutArgument('gloNotificationId'));
        outArguments.push(createOutArgument('gloNotificationPreliminaryStatus'));
        activityData['arguments'].execute.outArguments = outArguments;
    }

    function createOutArgument(name) {
        console.log("create out argument");
        var outArgument = {};
        outArgument[createOutArgumentName(name)] = 'String';
        return outArgument;
    }

    function createOutArgumentName(name) {
        return getActivityName() + "-" + name;
    }

    function isValidInput() {
        console.log("valid input");
        console.log("Review 1 " + isEmptyString(getMessageTemplate()));
        console.log("Review 2 " + isEmptyString(getPhone()));
        console.log("Review 3 " + isEmptyString(getEmail()));


        if( isEmptyString(getMessageTemplate()) ){
            return false;
        }
        
        if( isEmptyString(getPhone()) && isEmptyString(getEmail()) ){
            return false;
        }
        
        return true;
    }

    function getActivityName() {
        console.log("Get Activity Name");
        if (isEmptyString(activityName)) {
            activityName = constructActivityName();
        }
        return activityName;
    }

    function constructActivityName() {
        console.log("Construct activity name");
        var namedActivities = $.grep(journeyData['activities'], function(activity) {
            return !isEmptyString(activity.name) && activity.name.startsWith(activityNamePrefix);
        });
        var activityIndex = namedActivities ? namedActivities.length + 1 : 0;
        return activityNamePrefix + activityIndex;
    }

    function getMessageTemplate() {
        console.log("get Message Template");
        return $(messageTemplateSelector)[0].value;
    }  

    function getPhone() {
        console.log("get Phone");
        return $(phoneSelector).val();
    } 

    function getEmail() {
        console.log("get Email");
        return $(emailSelector).val();
    }
    

    function fillPlaceholderList(schema) {
        console.log("Fill placeholder");
        if (schema !== undefined && schema.length > 0) {
            for (var i in schema) {
                var field = schema[i];
                var fieldName = extractFieldName(field);
                if (isEventDataSourceField(field)) {
                    $(placeholderListSelector).append('<li>%%' + fieldName + '%%</li>');
                }
            }
        }
    }

    function fillPhoneCombobox(schema) {
        console.log("Fill Phone Combobox");
        if (schema !== undefined && schema.length > 0) {
            for (var i in schema) {
                var field = schema[i];
                var fieldName = extractFieldName(field);
                var fieldValue = "{{" + field.key + "}}";
                var fieldType = field.type;
                if(fieldType == "Phone"){                    
                    if (isEventDataSourceField(field)) {
                        var selected = fieldValue === phoneSelectorValue;
                        $(phoneSelector).append(new Option(fieldName, fieldValue, false, selected));
                    }
                }
            }
        }
    }

    function fillEmailCombobox(schema) {
        console.log("fill Email Combobox");
        if (schema !== undefined && schema.length > 0) {
            for (var i in schema) {
                var field = schema[i];
                var fieldName = extractFieldName(field);
                var fieldValue = "{{" + field.key + "}}";
                var fieldType = field.type;
                if(fieldType == "EmailAddress"){                    
                    if (isEventDataSourceField(field)) {
                        var selected = fieldValue === emailSelectorValue;
                        $(emailSelector).append(new Option(fieldName, fieldValue, false, selected));
                    }
                }
            }
        }
    }

    function saveFieldToInArguments(field, fieldName, inArguments) {
        console.log("Save Field to In Arguments");
        var obj = {};
        obj[fieldName] = "{{" + field.key + "}}";
        inArguments.push(obj);
    }

    function isEventDataSourceField(field) {
        console.log("is Event Data Source Field");
        return !field.key.startsWith('Interaction.');
    }

    function extractFieldName(field) {
        console.log("Extract field Name");
        var index = field.key.lastIndexOf('.');
        return field.key.substring(index + 1);
    }

    function isEmptyString(text) {
        console.log("Validate Empty String");
        return (!text || text.length === 0);
    }
});