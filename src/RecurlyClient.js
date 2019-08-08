var Promise = require('bluebird'),
    parser = require('xml2js'),
    parseXmlString = Promise.promisify(parser.parseString),
    builder = new parser.Builder(),
    _ = require('underscore'),
    moment = require('moment'),
    validStatusCodes = _([200,201,202,204]);

//#region Core Implementation

var client = {
    config: {
            version: 2,
            apiKey: '',
            subdomain: '',
            headers: {}
        },
    processPages: function(parameters) {
        return nextPage(parameters)
        .then(function(page) {
            parameters.page = page;
            page.next = function(cb){
                return Promise.try(function(){
                    if(_(page).has('nextUri')) {
                        delete page.items;
                        return client.processPages(parameters);
                    } else {
                        return Promise.resolve();
                    }
                }).nodeify(cb);
            };
            return Promise.resolve(page);
        });
    },
    processItems: function(parameters){
        var i = 0;
        return nextPage(parameters)
        .then(function processItem(page) {
            if(page.items.length > 0) {
                var item = i < page.items.length ? page.items[i] : null;

                if(!item && _(page).has('nextUri')) {
                    delete page.items;
                    parameters.page = page;
                    return client.processItems(parameters);
                }

                if(item) {
                    item.next = function(cb) {
                        return Promise.try(function() {
                            if(i < page.items.length){
                                i++;
                                return processItem(page);
                            } else {
                                return Promise.resolve();
                            }
                        }).nodeify(cb);
                    };
                    return Promise.resolve(item);
                } else {
                    return Promise.resolve();
                }
            } else {
                    return Promise.resolve();
            }
        });
    }
};

var clientErrors = {
    '401' : "<errors><error symbol='401'>401 - Your API key is missing or invalid.</error></errors>",
    '402' : "<errors><error symbol='402'>402 - Your Recurly account is in production mode but is not in good standing. Please pay any outstanding invoices.</error></errors>",
    '403' : "<errors><error symbol='403'>403 - The login is attempting to perform an action it does not have privileges to access. Verify your login credentials are for the appropriate account.</error></errors>",
    '404' : "<errors><error symbol='404'>404 - Not Found.</error></errors>"
};

function baseCommand(parameters) {
    var command = {
        options: {
            headers: _.extend({
                Authorization: 'Basic ' + new Buffer(client.config.apiKey).toString('base64'),
                'Cache-Control': 'no-cache',
                Accept: '*/*'
            }, client.config.headers),
            uri: 'https://' + client.config.subdomain + '.recurly.com/v' + client.config.version,
            method: 'get',
            encoding: null
        }
    };

    if(parameters.page && parameters.page.nextUri) {
        command.options.uri = parameters.page.nextUri;
    } else {
        command.options.uri = command.options.uri + '/' + parameters.route;
        command.options.method  = parameters.method ? parameters.method : 'get';
        command.options.body = parameters.body ? parameters.body : undefined;
        command.options.headers = _.extend(command.options.headers, parameters.headers || {});
        if(parameters.options){
            command.options.uri = command.options.uri + '?';
            for(key in parameters.options){
                command.options.uri = command.options.uri + key + '=' + encodeURIComponent(parameters.options[key]) + '&';
            }
        }
    }

    console.info(command.options.uri);
    command.execute = _(Promise.promisify(require('request'))).partial(command.options);

    return command;
}

function parseData(data) {
    _(data).each(function(value, key) {
        if (key === '$') {
            delete data[key];
        } else if (_(value).isObject()) {
            var meta = value['$'];

            if (meta) {
                if (meta.type === 'array') {
                    var fieldName = _(value).chain().keys().filter(function(x) { return x !== '$'; }).first().value();
                    if (fieldName) {
                        if (!_(value[fieldName]).isArray())
                            value[fieldName] = [value[fieldName]];
                        data[key] = _(value[fieldName]).map(parseData);
                    } else {
                        data[key] = [];
                    }
                }
            } else {
                if(_(value).isArray()){
                    if(value.length == 1){
                        var propertyValue = value[0],
                            propertyMeta =  propertyValue['$'],
                            inner = propertyValue['_'];

                        if(key == 'a'){
                            data['$'] = { uri: propertyMeta.href, method: propertyMeta.method};
                            delete data[key];
                        } else if(propertyMeta) {
                            if(propertyMeta.nil) {
                                data[key] = null;
                            } else if(propertyMeta.href) {
                                data[key].get = function(){
                                    return client.processItems({
                                        page: {
                                            size: 200,
                                            nextUri: propertyMeta.href
                                        }
                                    });
                                };
                                data[key].$ = { uri: propertyMeta.href, method: 'get'};
                            } else if(propertyMeta.code){
                                data[key] = inner;
                            } else if (propertyMeta.type) {

                                if (propertyMeta.type === 'boolean') {
                                    data[key] = /^true$/i.test(inner);
                                } else if (propertyMeta.type === 'datetime') {
                                    data[key] = moment(inner).format();
                                } else if (propertyMeta.type === 'integer') {
                                    data[key] = parseInt(inner);
                                } else if (propertyMeta.type === 'array') {
                                    data[key] = parseData(value);
                                    data[key] = data[key][0];
                                } else {
                                    data[key] = parseData(propertyValue);
                                }
                            } else {
                                if(inner && _(inner).isString()){
                                    data[key] = inner;
                                } else {
                                    data[key] = parseData(propertyValue);
                                }
                            }
                        } else{
                            if(_(propertyValue).isString()){
                                data[key] = propertyValue;
                            }
                            else {
                                data[key] = parseData(propertyValue);
                            }
                        }
                    }
                } else {
                    data[key] = parseData(value);
                }
            }
        }
    });
    return data;
}

function parseErrors(data) {
    var content = _(data.errors.error).isArray() ? data.errors.error : [data.errors.error];
    var errors = [];

    _(content).each(function(error) {
        errors.push({
            code: error.$.symbol ? error.$.symbol : null,
            field: error.$.field ? error.$.field : null,
            description: error._
        });
    });

    return errors;
}

function requestData(parameters){
    var command = baseCommand(parameters);
    return command.execute()
    .spread(function(response) {
        var content = clientErrors[response.statusCode] && ((response.body || '').toString().indexOf('<error>') < 0 ) ?
            clientErrors[response.statusCode] : response.body;
        if(!validStatusCodes.contains(response.statusCode)) {
            content = content.toString();
            return parseXmlString(content)
            .then(function(parsedResult) {
                var errors = [];
                if(_(parsedResult).has('errors')) {
                    errors = parseErrors(parsedResult);
                } else {
                    errors = parseData(parsedResult);
                }
                throw errors;
            });
        } else {
            // binary response, PDF invoice, etc
            if(response.headers['content-transfer-encoding'] && response.headers['content-transfer-encoding'] === 'binary') {
                return content;
            }

            // other api responses, XML
            content = content.toString();
            if(response.headers['content-type'] && response.headers['content-type'].indexOf('application/xml') > -1) {
                return parseXmlString(content)
                    .then(function (parsedResult) {
                        var fieldName = _(parsedResult).chain().keys().filter(function(x) { return x !== '$'; }).first().value();
                        return parseData(parsedResult[fieldName]);
                    });
            }

            return content;
        }
    });
}

function nextPage(parameters){
    var command = baseCommand(parameters);
    return command.execute()
    .spread(function(response) {
        var page = {
            size: parameters.page.size,
            totalRecords: response.headers['x-records'] ? parseInt(response.headers['x-records']) : 0,
            cancel: response.statusCode >= 400
        };

        var nav = response.headers.link ? response.headers.link.split(',') : [];
        _(nav).each(function(link) {
            var uriProperty = link.indexOf('rel="next"') > 0 ? 'nextUri' : 'previousUri';
            page[uriProperty] = link.match(/<(.*?)>/)[1];
        });

        var hasErrors = !validStatusCodes.contains(response.statusCode) || _(clientErrors).has(response.statusCode),
            content =  _(clientErrors).has(response.statusCode) ? clientErrors[response.statusCode] : response.body;

        return parseXmlString(content)
        .bind(page)
        .then(function (parsedResult) {
            if(hasErrors){
                throw parseErrors(parsedResult);
            } else {
                var processedResult = parseData(parsedResult);
                var itemsField = Object.keys(processedResult)[0];
                this.items = processedResult[itemsField];
            }
        })
        .return(page);
    });
}

//#region Blueprints

var requestBlueprint = function(route, parameters, processData) {
    if((arguments.length == 2) && (typeof parameters == 'function') ){
        processData = parameters;
        parameters = { };
    } else {
        parameters =  parameters ? parameters : { };
    }

    parameters.route = route;
    return requestData(parameters)
    .nodeify(processData);
};

var listBlueprint = function(route, parameters, processData) {
    if(arguments.length == 1){
        parameters = { page: { size: 200 } };
    } else if( (arguments.length == 2) && (typeof parameters == 'function') ){
        processData = parameters;
        parameters = { page: { size: 200 } };
    }

    if(processData && (typeof processData != 'function')) {
        throw new Error('Callback must be a function.');
    }

    var processor = parameters.perPage ? client.processPages : client.processItems;
    parameters.route = route;
    parameters.options = parameters.options ? parameters.options : {};
    _(parameters.options).extend({
        per_page: (parameters.page &&
                   parameters.page.size ? parameters.page.size : 200) });

    return processor(parameters)
    .nodeify(processData);
};

var listRootAggregateItemsBlueprint = function(route, idKey, itemsRoute, parameters, processData) {
    if(!_(parameters).has(idKey)){
        throw new Error('The ' + idKey + ' parameter is required.');
    }
    route = route + '/' +  parameters[idKey] + '/' + itemsRoute;
    return listBlueprint(route, parameters, processData);
};

var requestWithContentBlueprint = function(route, parameters, rootName, instance, processData) {
    builder.options.rootName = rootName;
    parameters.body = builder.buildObject(instance);
    return requestBlueprint(route, parameters, processData);
};

var updateBlueprint = function(route, rootNode, codeField, instance, processData) {
    route =  route + '/' + instance[codeField];
    delete instance[codeField];
    var parameters = {
        method : 'put'
    };
    return requestWithContentBlueprint(route, parameters, rootNode, instance, processData);
};

var deleteBlueprint = function(route, itemKey, processData) {
    route =  route + '/' + itemKey;
    var parameters = {
        method : 'delete'
    };
    return requestBlueprint(route, parameters, processData);
};

var createAggregateItemBlueprint = function(route, rootNode, itemKey, codeField, instance, processData) {
    route =  route + '/' + instance[codeField] + '/' + itemKey;
    delete instance[codeField];
    var parameters = {
        method : 'post'
    };
    return requestWithContentBlueprint(route, parameters, rootNode, instance, processData);
};

var updateAggregateItemBlueprint = function(route, rootNode, itemKey, codeField, instance, processData) {
    route =  route + '/' + instance[codeField] + '/' + itemKey;
    delete instance[codeField];
    var parameters = {
        method : 'put'
    };
    return requestWithContentBlueprint(route, parameters, rootNode, instance, processData);
};

var deleteAggregateItemBlueprint = function(route, itemKey, code, processData) {
    route =  route + '/' + code + '/' + itemKey;
    var parameters = {
        method : 'delete'
    };
    return requestBlueprint(route, parameters, processData);
};

//#endregion

//#endregion

//#region Explicit API Implementation

//#region Accounts

//Available option is state:[active|closed]
client.listAccounts = _(listBlueprint).partial('accounts');

client.getAccount = function(accountCode, processData) {
    return requestBlueprint('accounts/' + accountCode, processData);
};

client.createAccount = _(requestWithContentBlueprint)
.partial('accounts', {method: 'post'}, 'account');

client.updateAccount = _(updateBlueprint)
.partial('accounts', 'account', 'account_code');

client.getAccountBilling = function(accountCode, processData) {
    return requestBlueprint('accounts/' + accountCode + '/billing_info', processData);
};

client.updateAccountBilling = _(updateAggregateItemBlueprint)
.partial('accounts', 'billing_info', 'billing_info', 'account_code');

client.clearAccountBilling = _(deleteAggregateItemBlueprint)
.partial('accounts', 'billing_info');

//#endregion

//#region Subscriptions

//Available option is state:=[active|canceled|expired|future|in_trial|live|past_due]
client.listSubscriptions =  _(listBlueprint).partial('subscriptions');

client.listAccountSubscriptions = _(listRootAggregateItemsBlueprint)
.partial('accounts', 'account_code', 'subscriptions');

client.previewSubscription = _(requestWithContentBlueprint)
.partial('subscriptions/preview', {method: 'post'}, 'subscription');

client.createSubscription = _(requestWithContentBlueprint)
.partial('subscriptions', {method: 'post'}, 'subscription');

client.updateSubscription = _(updateBlueprint)
.partial('subscriptions', 'subscription', 'uuid');

client.getSubscription = function(uuid, processData) {
    return requestBlueprint('subscriptions/' + uuid, processData);
};

client.postponeSubscription = function(parameters, processData) {
    //Available options are next_renewal_date and bulk.
    var route = 'subscriptions/' + parameters.uuid + '/postpone/';
    return requestBlueprint(route, parameters, processData);
};

client.cancelSubscription = function(uuid, processData) {
    return requestBlueprint('subscriptions/' + uuid + '/cancel', { method: 'put' } , processData);
};

client.reactivateSubscription = function(uuid, processData) {
    return requestBlueprint('subscriptions/' + uuid + '/reactivate', { method: 'put' } , processData);
};

client.terminateSubscription = function(parameters, processData) {
    //Available option is refund.
    var route = 'subscriptions/' + parameters.uuid + '/terminate/';
    parameters.method = 'put';
    return requestBlueprint(route, parameters , processData);
};

//#endregion

//#region Transactions

client.getTransaction = function(uuid, processData) {
  return requestBlueprint('transactions/' + uuid, processData);
};

//Available options are state:=[successful|failed|voided], type:=[authorization|refund|purchase]
client.listTransactions =  _(listBlueprint).partial('transactions');

//Available options are state:=[successful|failed|voided], type:=[authorization|refund|purchase]
client.listAccountTransactions = _(listRootAggregateItemsBlueprint)
.partial('accounts', 'account_code', 'transactions');

client.createTransaction = _(requestWithContentBlueprint)
.partial('transactions', {method: 'post'}, 'transaction');

client.refundTransaction = function(parameters, processData) {
    //Available option is amount_in_cents.
    var route = 'transactions/' + parameters.uuid;
    parameters.method = 'delete';
    return requestBlueprint(route, parameters , processData);
};

//#endregion

//#region Coupons

//Available option is state:=[redeemable|expired|maxed_out|inactive]
client.listCoupons =  _(listBlueprint).partial('coupons');

client.getCoupon = function(couponCode, processData) {
  return requestBlueprint('coupons/' + couponCode, processData);
};

client.createCoupon = _(requestWithContentBlueprint)
  .partial('coupons', {method: 'post'}, 'coupon');

//#endregion

//#region Plans

client.createPlan = _(requestWithContentBlueprint)
    .partial('plans', {method: 'post'}, 'plan');

client.updatePlan = _(updateBlueprint)
    .partial('plans', 'plan', 'plan_code');

client.deletePlan = _(deleteBlueprint)
    .partial('plans');

client.listPlans =  _(listBlueprint).partial('plans');

client.createPlanAddon = _(createAggregateItemBlueprint)
    .partial('plans', 'add_on', 'add_ons', 'plan_code');

client.deletePlanAddon = function(planCode, addOnCode, processData) {
    var route =  '/plans/' + planCode + '/add_ons/' + addOnCode,
        parameters = {
            method : 'delete'
        };
    return requestBlueprint(route, parameters, processData);
};

client.listPlanAddons = _(listRootAggregateItemsBlueprint)
.partial('plans', 'plan_code', 'add_ons');

client.getPlan = function(planCode, processData) {
    return requestBlueprint('plans/' + planCode, processData);
};

client.getPlanAddOn = function(parameters, processData) {
    return requestBlueprint('plans/' + parameters.planCode + '/add_ons/' + parameters.addOnCode, processData);
};

//#endregion

//#region Invoices

client.listInvoices = _(listBlueprint).partial('invoices');

client.listAccountInvoices = _(listRootAggregateItemsBlueprint)
    .partial('accounts', 'account_code', 'invoices');


client.getInvoice = function(invoiceNumber, processData) {
    return requestBlueprint('invoices/' + invoiceNumber, processData);
};

client.getInvoicePDF = function(invoiceNumber, processData) {
    return requestBlueprint('invoices/' + invoiceNumber, {headers: {'Accept': 'application/pdf'}}, processData);
};

client.invoicePendingCharges = _(createAggregateItemBlueprint)
    .partial('accounts', 'invoice', 'invoices', 'account_code');

client.markInvoiceFailed = function(invoiceNumber, processData) {
  return requestBlueprint('invoices/' + invoiceNumber + '/mark_failed', { method: 'put' } , processData);
}

//#endregion

//#region Adjustments

client.createCharge = _(createAggregateItemBlueprint)
    .partial('accounts', 'adjustment', 'adjustments', 'account_code');

//#endregion Adjustments

client.parseData = parseData;

module.exports = client;
