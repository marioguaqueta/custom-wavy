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
    var destinationSelectorValue = undefined;
    var messageTemplateSelector = 'textarea#glo-message-template-input';
    var isTokenizedSelector = '#glo-is-tokenized-parameter';
    var isTokenizedValue = undefined;


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

        
        $(destinationSelector).change(function() {
            onInputChange();
            //to show in other step
            //$('#target-system').html(getTargetSystem()); 
        });

        onInputChange();
    }

    // Disable the next button if a value isn't selected
    function onInputChange() {
        var validInput = isValidInput();
        connection.trigger('updateButton', { button: 'next', enabled: validInput });
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
                } else if (key === 'destination') {
                    destinationSelectorValue = val;
                } else if (key === 'phone') {
                    phoneSelectorValue = val;
                } else if (key === 'email') {
                    emailSelectorValue = val;
                } else if(key === 'isTokenized') {
                    isTokenizedValue = val;
                }
            });
        });

        //Set saved values in Activity
        if (messageTemplate) {
            $(messageTemplateSelector).val(messageTemplate);
        }
        if (destinationSelectorValue) {
            $(destinationSelector).val(destinationSelectorValue);
        }
        if (phoneSelectorValue) {
            $(phoneSelector).val(phoneSelectorValue);
        }
        if (emailSelectorValue) {
            $(emailSelector).val(emailSelectorValue);
        }
        if (isTokenizedValue) {
            $(isTokenizedSelector). prop("checked", isTokenizedValue);
        }

        showStep(null, 1);
        connection.trigger('updateButton', { button: 'next', enabled: isValidInput() });
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
        console.log(tokens);
    }

    function onGetEndpoints (endpoints) {
        //Response: endpoints = { restHost: <url> } i.e. "rest.s1.qa1.exacttarget.com"
        console.log(endpoints);
    }

    function onClickedNext () {
        if (currentStep.key === 'step2') {
            save();
        } else {
            connection.trigger('nextStep');
        }
    }

    function onClickedBack () {
        connection.trigger('prevStep');
    }

    function onGotoStep (step) {
        showStep(step);
        connection.trigger('ready');
    }

    function showStep(step, stepIndex) {
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
        activityData.name = getActivityName();
        configureInArguments();
        configureOutArguments();

        activityData['metaData'].isConfigured = true;
        connection.trigger('updateActivity', activityData);
    }

    function configureInArguments() {
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
        var outArguments = [];
        outArguments.push(createOutArgument('gloNotificationId'));
        outArguments.push(createOutArgument('gloNotificationPreliminaryStatus'));
        activityData['arguments'].execute.outArguments = outArguments;
    }

    function createOutArgument(name) {
        var outArgument = {};
        outArgument[createOutArgumentName(name)] = 'String';
        return outArgument;
    }

    function createOutArgumentName(name) {
        return getActivityName() + "-" + name;
    }

    function isValidInput() {
        if( isEmptyString(getMessageTemplate()) )
            return false;
        
        if( isEmptyString(getPhone()) && isEmptyString(getEmail()) )
            return false;
        
        return true;
    }

    function getActivityName() {
        if (isEmptyString(activityName)) {
            activityName = constructActivityName();
        }
        return activityName;
    }

    function constructActivityName() {
        var namedActivities = $.grep(journeyData['activities'], function(activity) {
            return !isEmptyString(activity.name) && activity.name.startsWith(activityNamePrefix);
        });
        var activityIndex = namedActivities ? namedActivities.length + 1 : 0;
        return activityNamePrefix + activityIndex;
    }

    function getMessageTemplate() {
        return $(messageTemplateSelector)[0].value;
    }  

    function getPhone() {
        return $(phoneSelector).val();
    } 

    function getEmail() {
        return $(emailSelector).val();
    }
    

    function fillPlaceholderList(schema) {
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
        var obj = {};
        obj[fieldName] = "{{" + field.key + "}}";
        inArguments.push(obj);
    }

    function isEventDataSourceField(field) {
        return !field.key.startsWith('Interaction.');
    }

    function extractFieldName(field) {
        var index = field.key.lastIndexOf('.');
        return field.key.substring(index + 1);
    }

    function isEmptyString(text) {
        return (!text || text.length === 0);
    }
});