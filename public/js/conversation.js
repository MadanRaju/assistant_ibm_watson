// The ConversationPanel module is designed to handle
// all display and behaviors of the conversation column of the app.
/* eslint no-unused-vars: "off" */
/* global Api: true, Common: true*/

var ConversationPanel = (function () {
  var settings = {
    selectors: {
      chatBox: '#scrollingChat',
      fromUser: '.from-user',
      fromWatson: '.from-watson',
      latest: '.latest'
    },
    authorTypes: {
      user: 'user',
      watson: 'watson'
    }
  };

  // Publicly accessible methods defined
  return {
    init: init,
    inputKeyDown: inputKeyDown,
    sendMessage: sendMessage
  };

  // Initialize the module
  function init() {
    chatUpdateSetup();
    Api.sendRequest('', null);
    setupInputBox();
  }
  // Set up callbacks on payload setters in Api module
  // This causes the displayMessage function to be called when messages are sent / received
  function chatUpdateSetup() {
    var currentRequestPayloadSetter = Api.setRequestPayload;
    Api.setRequestPayload = function (newPayloadStr) {
      currentRequestPayloadSetter.call(Api, newPayloadStr);
      displayMessage(JSON.parse(newPayloadStr), settings.authorTypes.user);
    };

    var currentResponsePayloadSetter = Api.setResponsePayload;
    Api.setResponsePayload = function (newPayloadStr) {
      currentResponsePayloadSetter.call(Api, newPayloadStr);
      displayMessage(JSON.parse(newPayloadStr), settings.authorTypes.watson);
    };
  }

  // Set up the input box to underline text as it is typed
  // This is done by creating a hidden dummy version of the input box that
  // is used to determine what the width of the input text should be.
  // This value is then used to set the new width of the visible input box.
  function setupInputBox() {
    var input = document.getElementById('textInput');
    var dummy = document.getElementById('textInputDummy');
    var minFontSize = 14;
    var maxFontSize = 16;
    var minPadding = 4;
    var maxPadding = 6;

    // If no dummy input box exists, create one
    if (dummy === null) {
      var dummyJson = {
        'tagName': 'div',
        'attributes': [{
          'name': 'id',
          'value': 'textInputDummy'
        }]
      };

      dummy = Common.buildDomElement(dummyJson);
      document.body.appendChild(dummy);
    }

    function adjustInput() {
      if (input.value === '') {
        // If the input box is empty, remove the underline
        input.classList.remove('underline');
        input.setAttribute('style', 'width:' + '100%');
        input.style.width = '100%';
      } else {
        // otherwise, adjust the dummy text to match, and then set the width of
        // the visible input box to match it (thus extending the underline)
        input.classList.add('underline');
        var txtNode = document.createTextNode(input.value);
        ['font-size', 'font-style', 'font-weight', 'font-family', 'line-height',
          'text-transform', 'letter-spacing'
        ].forEach(function (index) {
          dummy.style[index] = window.getComputedStyle(input, null).getPropertyValue(index);
        });
        dummy.textContent = txtNode.textContent;

        var padding = 0;
        var htmlElem = document.getElementsByTagName('html')[0];
        var currentFontSize = parseInt(window.getComputedStyle(htmlElem, null).getPropertyValue('font-size'), 10);
        if (currentFontSize) {
          padding = Math.floor((currentFontSize - minFontSize) / (maxFontSize - minFontSize) *
            (maxPadding - minPadding) + minPadding);
        } else {
          padding = maxPadding;
        }

        var widthValue = (dummy.offsetWidth + padding) + 'px';
        input.setAttribute('style', 'width:' + widthValue);
        input.style.width = widthValue;
      }
    }

    // Any time the input changes, or the window resizes, adjust the size of the input box
    input.addEventListener('input', adjustInput);
    window.addEventListener('resize', adjustInput);

    // Trigger the input event once to set up the input box and dummy element
    Common.fireEvent(input, 'input');
  }

  // Display a user or Watson message that has just been sent/received
  function displayMessage(newPayload, typeValue) {
    var isUser = isUserMessage(typeValue);
    var textExists = (newPayload.input && newPayload.input.text) ||
      (newPayload.output && newPayload.output.text);
    if (isUser !== null && textExists) {
      // Create new message generic elements
      var responses = buildMessageDomElements(newPayload, isUser);
      var chatBoxElement = document.querySelector(settings.selectors.chatBox);
      var previousLatest = chatBoxElement.querySelectorAll((isUser ? settings.selectors.fromUser : settings.selectors.fromWatson) +
        settings.selectors.latest);
      // Previous "latest" message is no longer the most recent
      if (previousLatest) {
        Common.listForEach(previousLatest, function (element) {
          element.classList.remove('latest');
        });
      }
      setResponse(responses, isUser, chatBoxElement, 0, true);
    }
  }

  // Recurisive function to add responses to the chat area
  function setResponse(responses, isUser, chatBoxElement, index, isTop, businessLayerBypass, userInput) {
    if(businessLayerBypass){
      var canvas = document.createElement("CANVAS");
      canvas.id = "canvas_" + Math.random().toString(36).substring(7);
      canvas.style.width = "100%";
      canvas.style.height = "auto";

      var div = document.createElement("div");
      div.className = "from-watson,latest,top,from-watson-chart";
      div.appendChild(canvas); 
      chatBoxElement.appendChild(div);

      var currentCanvas = getCanvasObject(responses, isUser, isTop, canvas.id);
      chatBoxElement.appendChild(currentCanvas);
      // Class to start fade in animation
      // currentCanvas.classList.add('load');
      // Move chat to the most recent messages when new messages are added
      scrollToChatBottom();
      //setResponse(responses, isUser, chatBoxElement, index + 1, false);
    }
    else if(userInput){
      var userDiv = getDivObject(responses, isUser, isTop, true);
      chatBoxElement.appendChild(userDiv);
      // Class to start fade in animation
      userDiv.classList.add('load');
      // Move chat to the most recent messages when new messages are added
      scrollToChatBottom();
    }
    else if (index < responses.length) {
      var res = responses[index];
      if (res.type !== 'pause') {
        var currentDiv = getDivObject(res, isUser, isTop);
        chatBoxElement.appendChild(currentDiv);
        // Class to start fade in animation
        currentDiv.classList.add('load');
        // Move chat to the most recent messages when new messages are added
        scrollToChatBottom();
        setResponse(responses, isUser, chatBoxElement, index + 1, false);
      } else {
        var userTypringField = document.getElementById('user-typing-field');
        if (res.typing) {
          userTypringField.innerHTML = 'Bot is typing ...';
        }
        setTimeout(function () {
          userTypringField.innerHTML = '';
          setResponse(responses, isUser, chatBoxElement, index + 1, isTop);
        }, res.time);
      }
    }
  }

  // Constructs new DOM element from a message
  function getDivObject(res, isUser, isTop, userInput) {
    var classes = [(isUser ? 'from-user' : 'from-watson'), 'latest', (isTop ? 'top' : 'sub')];
    var messageJson = {
      // <div class='segments'>
      'tagName': 'div',
      'classNames': ['segments'],
      'children': [{
        // <div class='from-user/from-watson latest'>
        'tagName': 'div',
        'classNames': classes,
        'children': [{
          // <div class='message-inner'>
          'tagName': 'div',
          'classNames': ['message-inner'],
          'children': [{
            // <p>{messageText}</p>
            'tagName': 'p',
            'text': userInput ? res : res.innerhtml
          }]
        }]
      }]
    };
    return Common.buildDomElement(messageJson);
  }

  // Constructs new DOM element from a message
  function getCanvasObject(responses, isUser, isTop, canvasId) {
    var classes = [(isUser ? 'from-user' : 'from-watson'), 'latest', (isTop ? 'top' : 'sub')];
    var div = document.createElement('div');
    div.classList.add([classes, 'from-watson-chart']);
    var canvas = document.createElement('CANVAS');
    var ctx = canvas.getContext('2d');
    canvas.width = '100%';
    canvas.height = '300px';
    canvas.style.width = '100%';
    canvas.style.height = '300px';
    var options = { };
    var data = {
      labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      datasets: [
        {
          label: 'Prime and Fibonacci',
          fillColor: 'rgba(220,220,220,0.2)',
          strokeColor: 'rgba(220,220,220,1)',
          pointColor: 'rgba(220,220,220,1)',
          pointStrokeColor: '#fff',
          pointHighlightFill: '#fff',
          pointHighlightStroke: 'rgba(220,220,220,1)',
          data: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29]
        },
        {
          label: 'My Second dataset',
          fillColor: 'rgba(151,187,205,0.2)',
          strokeColor: 'rgba(151,187,205,1)',
          pointColor: 'rgba(151,187,205,1)',
          pointStrokeColor: '#fff',
          pointHighlightFill: '#fff',
          pointHighlightStroke: 'rgba(151,187,205,1)',
          data: [0, 1, 1, 2, 3, 5, 8, 13, 21, 34]
        }
      ]
    };
    var chart = document.getElementById(canvasId);
    var chartContext = chart.getContext('2d');

    if(responses.match(/bar/g) !== null){
      new Chart(chartContext).Bar(data, options);
    } else if(responses.match(/line/g) !== null) {
      new Chart(chartContext).Line(data, options);
    } else {
      new Chart(chartContext).Line(data, options);
    }
    new Chart(ctx).Line(data, options);
    div.appendChild(chart);
    return div;
  }

  // Checks if the given typeValue matches with the user "name", the Watson "name", or neither
  // Returns true if user, false if Watson, and null if neither
  // Used to keep track of whether a message was from the user or Watson
  function isUserMessage(typeValue) {
    if (typeValue === settings.authorTypes.user) {
      return true;
    } else if (typeValue === settings.authorTypes.watson) {
      return false;
    }
    return null;
  }

  function getOptions(optionsList, preference) {
    var list = '';
    var i = 0;
    if (optionsList !== null) {
      if (preference === 'text') {
        list = '<ul>';
        for (i = 0; i < optionsList.length; i++) {
          if (optionsList[i].value) {
            list += '<li><div class="options-list" onclick="ConversationPanel.sendMessage(\'' +
            optionsList[i].value.input.text + '\');" >' + optionsList[i].label + '</div></li>';
          }
        }
        list += '</ul>';
      } else if (preference === 'button') {
        list = '<br>';
        for (i = 0; i < optionsList.length; i++) {
          if (optionsList[i].value) {
            var item = '<div class="options-button" onclick="ConversationPanel.sendMessage(\'' +
              optionsList[i].value.input.text + '\');" >' + optionsList[i].label + '</div>';
            list += item;
          }
        }
      }
    }
    return list;
  }

  function getResponse(responses, gen) {
    var title = '';
    if (gen.hasOwnProperty('title')) {
      title = gen.title;
    }
    if (gen.response_type === 'image') {
      var img = '<div><img src="' + gen.source + '" width="300"></div>';
      responses.push({
        type: gen.response_type,
        innerhtml: title + img
      });
    } else if (gen.response_type === 'text') {
      responses.push({
        type: gen.response_type,
        innerhtml: gen.text
      });
    } else if (gen.response_type === 'pause') {
      responses.push({
        type: gen.response_type,
        time: gen.time,
        typing: gen.typing
      });
    } else if (gen.response_type === 'option') {
      var preference = 'text';
      if (gen.hasOwnProperty('preference')) {
        preference = gen.preference;
      }

      var list = getOptions(gen.options, preference);
      responses.push({
        type: gen.response_type,
        innerhtml: title + list
      });
    }
  }

  // Constructs new generic elements from a message payload
  function buildMessageDomElements(newPayload, isUser) {
    var textArray = isUser ? newPayload.input.text : newPayload.output.text;
    if (Object.prototype.toString.call(textArray) !== '[object Array]') {
      textArray = [textArray];
    }

    var responses = [];

    if (newPayload.hasOwnProperty('output')) {
      if (newPayload.output.hasOwnProperty('generic')) {

        var generic = newPayload.output.generic;

        generic.forEach(function (gen) {
          getResponse(responses, gen);
        });
      }
    } else if (newPayload.hasOwnProperty('input')) {
      var input = '';
      textArray.forEach(function (msg) {
        input += msg + ' ';
      });
      input = input.trim()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      if (input.length !== 0) {
        responses.push({
          type: 'text',
          innerhtml: input
        });
      }
    }
    return responses;
  }

  // Scroll to the bottom of the chat window
  function scrollToChatBottom() {
    var scrollingChat = document.querySelector('#scrollingChat');
    scrollingChat.scrollTop = scrollingChat.scrollHeight;
  }

  function sendMessage(text) {
    //Check if the text has to be processed internally
    if(businessLayerLanding(text)){
      var chatBoxElement = document.querySelector(settings.selectors.chatBox);
      setResponse(text, true, chatBoxElement, 0, true, false, true);
      setResponse(text, false, chatBoxElement, 0, true, true);
    }
    // Retrieve the context from the previous server response
    else {
      var context;
      var latestResponse = Api.getResponsePayload();
      if (latestResponse) {
        context = latestResponse.context;
      }

      // Send the user message
      Api.sendRequest(text, context);
    }
  }

  //Business layer logic
  function businessLayerLanding(text){
    return text.match(/stock market/g) !== null;
  }

  // Handles the submission of input
  function inputKeyDown(event, inputBox) {
    // Submit on enter key, dis-allowing blank messages
    if (event.keyCode === 13 && inputBox.value) {
      sendMessage(inputBox.value);
      // Clear input box for further messages
      inputBox.value = '';
      Common.fireEvent(inputBox, 'input');
    }
  }
}());