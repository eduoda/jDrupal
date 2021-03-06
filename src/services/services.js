/**
 * The Drupal services JSON object.
 */
Drupal.services = {};

/**
 * Drupal Services XMLHttpRequest Object.
 * @param {Object} options
 */
Drupal.services.call = function(options) {
  try {
    options.debug = false;

    // Make sure the settings have been provided for Services.
    if (!services_ready()) {
      var error = 'Set the site_path and endpoint on Drupal.settings!';
      options.error(null, null, error);
      return;
    }

    if (options.hasOwnProperty('tries')) {
      options.tries++;
    } else {
      module_invoke_all('services_preprocess', options);
      options.tries = 1;
    }
//     if (!drupalgap.online) {
//       module_invoke_all('services_postprocess', options, 0);
//       if (options.hasOwnProperty('retry') && options.retry) {
//         _services_queue_submission(options);
//         if (typeof options.queued !== 'undefined') {
//           options.queued(options);
//         }
//       }
//       return;
//     }

    // Build the Request, URL and extract the HTTP method.
    var request = new XMLHttpRequest();
    request.timeout = Drupal.settings.timeout ? Drupal.settings.timeout : 5000;
    var url = Drupal.settings.site_path +
              Drupal.settings.base_path + '?q=';
    // Use an endpoint, unless someone passed in an empty string.
    if (typeof options.endpoint === 'undefined') {
      url += Drupal.settings.endpoint + '/';
    }
    else if (options.endpoint != '') {
      url += options.endpoint + '/';
    }
    url += options.path;
    var method = options.method.toUpperCase();
    if (Drupal.settings.debug) { console.log(method + ': ' + url); }

    request.addEventListener('error', function(e) {
      _services_submission_error_handler(options);
    });
    request.addEventListener('abort', function(e) {
//       _services_submission_error_handler(options);
    });
    request.addEventListener('timeout', function(e) {
      _services_submission_error_handler(options);
    });

    // Request Success Handler
    request.onload = function(e) {
      try {
        // Build a human readable response title.
        var title = request.status + ' - ' +
          http_status_code_title(request.status);
        // 200 OK
        if (request.status == 200) {
          if (Drupal.settings.debug) { console.log('200 - OK'); }
          // Extract the JSON result, or throw an error if the response wasn't
          // JSON.

          // Extract the JSON result if the server sent back JSON, otherwise
          // hand back the response as is.
          var result = null;
          var response_header = request.getResponseHeader('Content-Type');
          if (response_header.indexOf('application/json') != -1) {
            result = JSON.parse(request.responseText);
          }
          else { result = request.responseText; }

          // Give modules a chance to pre post process the results, send the
          // results to the success callback, then give modules a chance to
          // post process the results.
          module_invoke_all(
            'services_request_pre_postprocess_alter',
            options,
            result
          );

          if (typeof options.success !== 'undefined')
            options.success(result);

          module_invoke_all(
            'services_request_postprocess_alter',
            options,
            result
          );
          module_invoke_all('services_postprocess', options, result);
        }
        else {
          // Not OK...
          if (Drupal.settings.debug) {
            console.log(method + ': ' + url + ' - ' + title);
            console.log(request.responseText);
            console.log(request.getAllResponseHeaders());
          }
          if (request.responseText) { console.log(request.responseText); }
          else { dpm(request); }
          if (typeof options.error !== 'undefined') {
            var message = request.responseText || '';
            if (!message || message == '') { message = title; }
            options.error(request, request.status, message);
          }
          // server error, contrib bug? probably we should not retry
          options.retry = false;
          _services_submission_error_handler(options);
        }
        _services_process_submission_queue();
      }
      catch (error) {
        // Not OK...
        if (Drupal.settings.debug) {
          console.log(method + ' (ERROR): ' + url + ' - ' + title);
          console.log(request.responseText);
          console.log(request.getAllResponseHeaders());
        }
        console.log('Drupal.services.call - onload - ' + error);
        _services_submission_error_handler(options);
      }
    };

    // Get the CSRF Token and Make the Request.
    services_get_csrf_token({
        debug: options.debug,
        success: function(token) {
          try {
            // Async, or sync? By default we'll use async if none is provided.
            var async = true;
            if (typeof options.async !== 'undefined' &&
              options.async === false) { async = false; }

            // Open the request.
            request.open(method, url, async);

            // Determine content type header, if necessary.
            var contentType = null;
            if (method == 'POST') {
              contentType = 'application/json';
              // The user login resource needs a url encoded data string.
              if (options.service == 'user' &&
                options.resource == 'login') {
                contentType = 'application/x-www-form-urlencoded';
              }
            }
            else if (method == 'PUT') {
              contentType = 'application/json';
            }

            // Anyone overriding the content type?
            if (options.contentType) { contentType = options.contentType; }

            // Set the content type on the header, if we have one.
            if (contentType) {
              request.setRequestHeader('Content-type', contentType);
            }

            // Add the token to the header if we have one.
            if (token) {
              request.setRequestHeader('X-CSRF-Token', token);
            }

            // Send the request with or without data.
            if (typeof options.data !== 'undefined') {
              // Print out debug information if debug is enabled. Don't print
              // out any sensitive debug data containing passwords.
              if (Drupal.settings.debug) {
                var show = true;
                if (options.service == 'user' &&
                  in_array(options.resource, ['login', 'create', 'update'])) {
                  show = false;
                }
                if (show) {
                  if (typeof options.data === 'object') {
                    console.log(JSON.stringify(options.data));
                  }
                  else { console.log(options.data); }
                }
              }
              request.send(options.data);
            }
            else { request.send(null); }

          }
          catch (error) {
            console.log(
              'Drupal.services.call - services_get_csrf_token - success - ' +
              error
            );
            _services_submission_error_handler(options);
          }
        },
        error: function(xhr, status, message) {
          try {
            console.log(
              'Drupal.services.call - services_get_csrf_token - ' + message
            );
          }
          catch (error) {
            console.log(
              'Drupal.services.call - services_get_csrf_token - error - ' +
              error
            );
          }
          _services_submission_error_handler(options);
        }
    });

  }
  catch (error) {
    console.log('Drupal.services.call - error - ' + error);
  }
};

/**
 * Gets the CSRF token from Services.
 * @param {Object} options
 */
function services_get_csrf_token(options) {
  try {

    var token;

    // Are we resetting the token?
    if (options.reset) { Drupal.sessid = null; }

    // Do we already have a token? If we do, return it the success callback.
    if (Drupal.sessid) { token = Drupal.sessid; }
    if (token) {
      if (options.success) { options.success(token); }
      return;
    }

    // We don't have a token, let's get it from Drupal...

    // Build the Request and URL.
    var token_request = new XMLHttpRequest();
    var token_url = Drupal.settings.site_path +
              Drupal.settings.base_path +
              '?q=services/session/token';

    token_request.addEventListener('error', function(e) {
      if (options.error) { options.error(); }
    });
    token_request.addEventListener('abort', function(e) {
      //if (options.error) { options.error(); }
    });
    token_request.addEventListener('timeout', function(e) {
      if (options.error) { options.error(); }
    });


    // Token Request Success Handler
    token_request.onload = function(e) {
      try {
        var title = token_request.status + ' - ' +
          http_status_code_title(token_request.status);
        if (token_request.status != 200) { // Not OK
          if (options.error) { options.error(); }
          console.log(token_url + ' - ' + title);
          console.log(token_request.responseText);
        }
        else { // OK
          // Set Drupal.sessid with the token, then return the token to the
          // success function.
          token = token_request.responseText;
          Drupal.sessid = token;
          if (options.success) { options.success(token); }
        }
      }
      catch (error) {
        if (options.error) { options.error(); }
        console.log(
          'services_get_csrf_token - token_request. onload - ' + error
        );
      }
    };

    // Open the token request.
    token_request.open('GET', token_url, true);

    // Send the token request.
    token_request.send(null);
  }
  catch (error) { console.log('services_get_csrf_token - ' + error); }
}

/**
 * Checks if we're ready to make a Services call.
 * @return {Boolean}
 */
function services_ready() {
  try {
    var result = true;
    if (Drupal.settings.site_path == '') {
      result = false;
      console.log('jDrupal\'s Drupal.settings.site_path is not set!');
    }
    if (Drupal.settings.endpoint == '') {
      result = false;
      console.log('jDrupal\'s Drupal.settings.endpoint is not set!');
    }
    return result;
  }
  catch (error) { console.log('services_ready - ' + error); }
}

/**
 * Given the options for a service call, the service name and the resource name,
 * this will attach the names and their values as properties on the options.
 * @param {Object} options
 * @param {String} service
 * @param {String} resource
 */
function services_resource_defaults(options, service, resource) {
  try {
    if (!options.service) { options.service = service; }
    if (!options.resource) { options.resource = resource; }
  }
  catch (error) { console.log('services_resource_defaults - ' + error); }
}

/**
 * Returns true if the entity_id is already queued for the service resource,
 * false otherwise.
 * @param {String} service
 * @param {String} resource
 * @param {Number} entity_id
 * @param {String} callback_type
 * @return {Boolean}
 */
function _services_queue_already_queued(service, resource, entity_id,
  callback_type) {
  try {
    var queued = false;
    if (
      typeof Drupal.services_queue[service][resource][entity_id] !== 'undefined'
    ) {
      //queued = true;
      var queue = Drupal.services_queue[service][resource][entity_id];
      if (queue[callback_type].length != 0) { queued = true; }
    }
    return queued;
  }
  catch (error) { console.log('_services_queue_already_queued - ' + error); }
}

/**
 * Adds an entity id to the service resource queue.
 * @param {String} service
 * @param {String} resource
 * @param {Number} entity_id
 */
function _services_queue_add_to_queue(service, resource, entity_id) {
  try {
    Drupal.services_queue[service][resource][entity_id] = {
      entity_id: entity_id,
      success: [],
      error: []
    };
  }
  catch (error) { console.log('_services_queue_add_to_queue - ' + error); }
}

/**
 * Removes an entity id from the service resource queue.
 * @param {String} service
 * @param {String} resource
 * @param {Number} entity_id
 */
function _services_queue_remove_from_queue(service, resource, entity_id) {
  try {
    console.log('WARNING: services_queue_remove_from_queue() not done yet!');
  }
  catch (error) {
    console.log('_services_queue_remove_from_queue - ' + error);
  }
}

/**
 * Adds a callback function to the service resource queue.
 * @param {String} service
 * @param {String} resource
 * @param {Number} entity_id
 * @param {String} callback_type
 * @param {Function} callback
 */
function _services_queue_callback_add(service, resource, entity_id,
  callback_type, callback) {
  try {
    Drupal.services_queue[service][resource][entity_id][callback_type].push(
      callback
    );
  }
  catch (error) { console.log('_services_queue_callback_add - ' + error); }
}

/**
 * Returns the number of callback functions for the service resource queue.
 * @param {String} service
 * @param {String} resource
 * @param {Number} entity_id
 * @param {String} callback_type
 * @return {Number}
 */
function _services_queue_callback_count(service, resource, entity_id,
  callback_type) {
  try {
    var length =
      Drupal.services_queue[service][resource][entity_id][callback_type].length;
    return length;
  }
  catch (error) { console.log('_services_queue_callback_count - ' + error); }
}

/**
 * RETRY QUEUE HELPERS
 */

function _services_process_submission_queue() {
  try {
    var submission = _services_dequeue_submission();
    if (typeof submission !== 'undefined')
      Drupal.services.call(submission);
  }
  catch (error) {
    console.log('_services_process_submission_queue - ' + error);
  }
}

function _services_get_submission_queue() {
  try {
    var queue = variable_get('services_submission_queue', []);
    if (typeof queue === 'string') { queue = JSON.parse(queue); }
    return queue;
  }
  catch (error) { console.log('_services_get_submission_queue - ' + error); }
}

function _services_set_submission_queue(queue) {
  try {
    variable_set('services_submission_queue', queue);
  }
  catch (error) { console.log('_services_set_submission_queue - ' + error); }
}

function _services_queue_submission(submission) {
  try {
    var queue = _services_get_submission_queue();
    queue.push(submission);
    _services_set_submission_queue(queue);
  }
  catch (error) { console.log('_services_queue_submission - ' + error); }
}

function _services_dequeue_submission() {
  try {
    var queue = _services_get_submission_queue();
    var submission = queue.shift();
    _services_set_submission_queue(queue);
    return submission;
  }
  catch (error) { console.log('_services_dequeue_submission - ' + error); }
}

function _services_submission_error_handler(options) {
  try {
    module_invoke_all('services_postprocess', options, 0);
    //retry or...
    if (options.hasOwnProperty('retry') && options.retry) {
      _services_queue_submission(options);
      if (typeof options.queued !== 'undefined') {
        options.queued(options);
      }
    }
    // ...give up
    else if (typeof options.error !== 'undefined') {
      options.error(xhr, status, message);
    }
  }
  catch (error) {
    console.log('_services_submission_error_handler - ' + error);
  }
}
