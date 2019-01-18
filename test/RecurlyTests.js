var _ = require('underscore'),
    client = require('../src/RecurlyClient');

describe('Recurly', function() {
    
    //#region Configuration

    this.timeout(60*60*1000);
    
    client.config = {
        version: 2,
        apiKey: process.env.RECURLY_API_KEY,
        subdomain: process.env.RECURLY_SUBDOMAIN
    };
    
    var testAccountCode = 'NRCAPI0005';
    var newAccountId = 'TEST-' + getId();

    //#endregion

    before(function(done) {
        var params = {
            perPage: true,
            page: {
                size: 3
            },
            options: {
                state: 'active'
            }
        };

        client.listAccounts(params).then(page => _.first(page.items)).then(account => {
            if (!account) done('No Active Accounts Found!');
            testAccountCode = account.account_code;
            done();
        }).catch(function(err) {
            done(JSON.stringify(err));
        });
    });

    describe('Accounts', function() {

        it('should retreive account information iterate per page callback.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                },
                options: {
                    state: 'active'
                }
            };

            console.info("Accounts".green);
            listCallback(client.listAccounts, params, done);
        });

        it('should retreive account information iterate per item callback.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Accounts".green);
            listCallback(client.listAccounts, params, done);
        });

        it('should retreive account information iterate per page promise.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Accounts".green);
            listPromise(client.listAccounts, params, done);
        });

        it('should retreive account information iterate per item promise.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Accounts".green);
            listPromise(client.listAccounts, params, done);
        });

        it('should retreive account subscription information iterate per item promise.', function(done) {

            var params = {
                page: {
                    size: 3
                },
                account_code: testAccountCode
            };

            console.info("Account Subscriptions".green);
            client.listAccountSubscriptions(params)
            .then(function(subscription) {
                console.info(JSON.stringify(subscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });
        
        it('should retreive account information iterate per account and retrieve children.', function(done) {

            var accountCount = 0;
            var now = new Date();

            client.listAccounts()
            .then(function processAccount(account) {
                if(account) {

                    accountCount++;
                    var interval = ((new Date()) - now) / 1000;
                    console.info(('Account: #' + accountCount + ' in ' + interval + ' secs.' + ' - [' + account.company_name + ' : ' + account.account_code+ ']').green);
                    console.info(JSON.stringify(account));


                    console.info('Retrieving adjustments...');
                    return account.adjustments.get()
                    .then(function processAdjustment(adjustment){
                        if(adjustment){
                            console.info(('Adjustment:').green);
                            console.info(JSON.stringify(adjustment));
                            return adjustment.next()
                            .then(processAdjustment);
                        }
                    })
                    .then(function(){
                        console.info('Retrieving invoices...');
                        return account.invoices.get()
                        .then(function processInvoice(invoice){
                            if(invoice){
                                console.info(('Invoice:').green);
                                console.info(JSON.stringify(invoice));
                                return invoice.next()
                                .then(processInvoice);
                            }
                        });
                    })
                    .then(function(){
                        console.info('Retrieving subscriptions...');
                        return account.subscriptions.get()
                        .then(function processSubscription(subscription){
                            if(subscription){
                                console.info(('Subscriptions:').green);
                                console.info(JSON.stringify(subscription));
                                return subscription.next()
                                .then(processSubscription);
                            }
                        });
                    })
                    .then(function(){
                        console.info('Retrieving transactions...');
                        return account.transactions.get()
                        .then(function processTransaction(transaction){
                            if(transaction){
                                //console.info(('Transaction:').green);
                                //console.info(JSON.stringify(transaction));
                                return transaction.next()
                                .then(processTransaction);
                            }
                        });
                    })
                    .then(function(){
                        return account.next()
                        .then(processAccount);
                    });
                }
            })
            .then(done)
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should retreive account using promise.', function(done){
            var now = new Date();
            client.getAccount("NRCAPI0006")
            .then(function proccessAccount(account) {
                console.info(JSON.stringify(account));
                var interval = ((new Date()) - now) / 1000;
                console.info(('Retrieved Account: ' + account.company_name + ' in ' + interval + ' secs.').green);
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it('should retreive account using callback.', function(done){
            var now = new Date();
            client.getAccount(testAccountCode, function proccessAccount(err, account) {
                console.info(JSON.stringify(account));
                if(err){
                    done(JSON.stringify(err));
                }
                var interval = ((new Date()) - now) / 1000;
                console.info(('Retrieved Account: ' + account.company_name + ' in ' + interval + ' secs.').green);
                done();
            });
        });

        it('should create an account', function(done){
            var account = {
                "account_code": newAccountId,
                "email": "1234@fax.com",
                "first_name": "Lisa",
                "last_name": "Arnold",
                "company_name": "School District: " + newAccountId,
                "vat_number": null,
                "address": {
                    "address1": "123 Main St.",
                    "city": "Miami",
                    "state": "WA",
                    "zip": "33405",
                    "country": null,
                    "phone": "+1 305-482-2822"
                },
                "accept_language": null
            };

            client.createAccount(account)
            .then(function(newAccount) {
                console.info(JSON.stringify(newAccount));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it('should update an account', function(done){
            var account = {
                "account_code": newAccountId,
                "first_name": "Jeff"
            };

            client.updateAccount(account)
            .then(function(newAccount) {
                console.info(JSON.stringify(newAccount));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it('should update account billing', function(done){
            var billingInfo = {
              "account_code": newAccountId,
              "first_name": "Marc",
              "last_name": "Much",
              "number": "4111-1111-1111-1111",
              "verification_value": 123,
              "month": 11,
              "year": 2049
            };

            client.updateAccountBilling(billingInfo)
            .then(function(newBillingInfo) {
                console.info(JSON.stringify(newBillingInfo));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it('should clear account billing', function(done){
            client.clearAccountBilling(newAccountId)
            .then(function() {
                console.info('Billing information cleared.'.green);
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

    });

    describe('Subscriptions', function() {

        var newSubscriptionId = '29f921d06a6ae4530cc1ed411f979048';

        it('should retreive subscription information iterate per page callback.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Subsciptions".green);
            listCallback(client.listSubscriptions, params, done);
        });

        it('should retreive subscription information iterate per item callback.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Subsciptions".green);
            listCallback(client.listSubscriptions, params, done);
        });

        it('should retreive subscription information iterate per page promise.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Subsciptions".green);
            listPromise(client.listSubscriptions, params, done);
        });

        it('should retreive subscription information iterate per item promise.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Subsciptions".green);
            listPromise(client.listSubscriptions, params, done);
        });

        it.skip('should preview a subscription', function(done){
            var subscription = {
                "plan_code": "professional-annual-annual-0",
                "currency": "USD",
                "unit_amount_in_cents": 1000,
                "account": {
                    "account_code": newAccountId,
                    "email": "verena@example.com",
                    "first_name": "Verena",
                    "last_name": "Example",
                    "billing_info": {
                        "number": "4111-1111-1111-1111",
                        "month": 10,
                        "year": 2049
                    }
                }
            };

            client.previewSubscription(subscription)
            .then(function(newSubscription) {
                console.info(JSON.stringify(newSubscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should create a subscription', function(done){
            var subscription = {
                "plan_code": "professional-annual-annual-0",
                "currency": "USD",
                "unit_amount_in_cents": 1000,
                "account": {
                    "account_code": newAccountId,
                    "email": "verena@example.com",
                    "first_name": "Verena",
                    "last_name": "Example",
                    "billing_info": {
                        "number": "4111-1111-1111-1111",
                        "month": 10,
                        "year": 2049
                    }
                }
            };

            client.createSubscription(subscription)
            .then(function(newSubscription) {
                newSubscriptionId = newSubscription.uuid;
                console.info(JSON.stringify(newSubscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should retreive a subscription using promise.', function(done){
            client.getSubscription(newSubscriptionId)
            .then(function proccessSubscription(subscription) {
                console.info(JSON.stringify(subscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should cancel a subscription using promise.', function(done){
            client.cancelSubscription(newSubscriptionId)
            .then(function proccessSubscription(subscription) {
                console.info(JSON.stringify(subscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should reactivate a subscription using promise.', function(done){
            client.reactivateSubscription(newSubscriptionId)
            .then(function proccessSubscription(subscription) {
                console.info(JSON.stringify(subscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should postpone a subscription using promise.', function(done){
            var nextMonth = new Date();
            nextMonth.setMonth(nextMonth.getMonth() + 1);

            client.terminateSubscription({
                uuid: newSubscriptionId,
                options: {
                    next_renewal_date: nextMonth
                }
            })
            .then(function proccessSubscription(subscription) {
                console.info(JSON.stringify(subscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should terminate a subscription using promise.', function(done){
            client.terminateSubscription({
                uuid: newSubscriptionId,
                options: {
                    refund: 'none'
                }
            })
            .then(function proccessSubscription(subscription) {
                console.info(JSON.stringify(subscription));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });
    });

    describe('Transactions', function() {

        var newTransactionId = null;

        it('should retreive transaction information iterate per page callback.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Transactions".green);
            listCallback(client.listTransactions, params, done);
        });

        it('should retreive transactions information iterate per item callback.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Transactions".green);
            listCallback(client.listTransactions, params, done);
        });

        it('should retreive transactions information iterate per page promise.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Transactions".green);
            listPromise(client.listTransactions, params, done);
        });

        it('should retreive transactions information iterate per item promise.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Transactions".green);
            listPromise(client.listTransactions, params, done);
        });

        it('should create an transaction.', function(done){

            var transaction =
            {
                "amount_in_cents": 1000,
                "currency": "USD",
                "account": {
                    "account_code": testAccountCode,
                    "billing_info": {
                        "first_name": "Verena",
                        "last_name": "Example",
                        "number": "4111-1111-1111-1111",
                        "verification_value": "123",
                        "month": 11,
                        "year": 2049
                    }
                }
            };

            client.createTransaction(transaction)
            .then(function(newTransaction) {
                newTransactionId = newTransaction.uuid;
                console.info(JSON.stringify(newTransaction));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });

        it.skip('should refund a transaction using promise.', function(done){
            client.refundTransaction({
                uuid: newTransactionId,
                options: {
                    amount_in_cents: 800
                }
            })
            .then(function proccessTransaction(transaction) {
                console.info('Refunded transaction.'.green);
                console.info(JSON.stringify(transaction));
                done();
            })
            .catch(function(err) {
                done(JSON.stringify(err));
            });
        });
    });

    describe('Coupons', function() {

        it('should retrieve coupons information iterate per page callback.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Coupons".green);
            listCallback(client.listCoupons, params, done);
        });

        it('should retrieve coupons information iterate per item callback.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Coupons".green);
            listCallback(client.listCoupons, params, done);
        });

        it('should retreive coupons information iterate per page promise.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Coupons".green);
            listPromise(client.listCoupons, params, done);
        });

        it('should retreive coupons information iterate per item promise.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Coupons".green);
            listPromise(client.listCoupons, params, done);
        });
    });

    describe('Plans', function() {

        it('should create a plan', function(done){
            var plan = {
                "plan_code": "unit_test_plan",
                "name": "Unit Test Plan",
                "unit_amount_in_cents": { "USD": 0 },
                "plan_interval_unit": "days",
                "plan_interval_length": 1
            };

            client.createPlan(plan)
                .then(function(newPlan) {
                    console.info(JSON.stringify(newPlan));
                    done();
                })
                .catch(function(err) {
                    done(JSON.stringify(err));
                });
        });

        it('should create a plan add on', function (done) {
            var planAddOn = {
                "plan_code": "unit_test_plan",
                "add_on_code": "search-included",
                "name": "Search License(s) Included in Plan",
                "unit_amount_in_cents": { "USD" : 0 },
            };

            client.createPlanAddon(planAddOn)
                .then(function (newAddOn) {
                    console.info(JSON.stringify(newAddOn));
                    done();
                })
                .catch(function (err) {
                    done(JSON.stringify(err));
                });
        });

        it('should delete a plan add on', function (done) {
            client.deletePlanAddon("unit_test_plan", "search-included")
                .then(function (result) {
                    console.info(JSON.stringify(result));
                    done();
                })
                .catch(function (err) {
                    done(JSON.stringify(err));
                });
        });

        it('should update a plan', function(done){
            var params = {
                "plan_code": "unit_test_plan",
                "plan_interval_unit": "months",
                "plan_interval_length": 5
            };

            client.updatePlan(params)
                .then(function(updatedPlan) {
                    console.info(JSON.stringify(updatedPlan));
                    done();
                })
                .catch(function(err) {
                    done(JSON.stringify(err));
                });
        });

        it('should delete a plan', function(done){

            client.deletePlan("unit_test_plan")
                .then(function() {
                    console.info("unit_test_plan was deleted");
                    done();
                })
                .catch(function(err) {
                    done(JSON.stringify(err));
                });
        });

        it('should retreive plans information iterate per page callback.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Plans".green);
            listCallback(client.listPlans, params, done);
        });

        it('should retreive plans information iterate per item callback.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Plans".green);
            listCallback(client.listPlans, params, done);
        });

        it('should retreive plans information iterate per page promise.', function(done) {

            var params = {
                perPage: true,
                page: {
                    size: 3
                }
            };

            console.info("Plans".green);
            listPromise(client.listPlans, params, done);
        });

        it('should retreive plans information iterate per item promise.', function(done) {

            var params = {
                page: {
                    size: 3
                }
            };

            console.info("Plans".green);
            listPromise(client.listPlans, params, done);
        });

        //it('should retreive plan using promise.', function(done){
        //    var now = new Date();
        //    client.getPlan("professional-annual-annual-0")
        //    .then(function proccessPlan(plan) {
        //        console.info(JSON.stringify(plan));
        //        done();
        //    })
        //    .catch(function(err) {
        //        done(JSON.stringify(err));
        //    });
        //});
        //
        //it('should retreive plan-add-on using promise.', function(done){
        //    var now = new Date();
        //    client.getPlanAddOn({
        //        planCode: 'professional-annual-annual-0',
        //        addOnCode: 'search-included'
        //    })
        //    .then(function proccessAddOn(addOn) {
        //        console.info(JSON.stringify(addOn));
        //        done();
        //    })
        //    .catch(function(err) {
        //        done(JSON.stringify(err));
        //    });
        //});
    });

    describe('Adjustments', function() {
        it('should create a charge', done => {
            var charge = {
                "account_code": testAccountCode,
                "currency": "USD",
                "unit_amount_in_cents": 10000,
            };

            client.createCharge(charge)
                .then(newCharge => {
                    console.info(JSON.stringify(newCharge));
                    done();
                })
                .catch(err => done(JSON.stringify(err)));
        });

        it('should post invoice', function(done) {
            client.invoicePendingCharges({ account_code: testAccountCode })
                .then(result => {
                    console.info(JSON.stringify(result));
                    done();
                })
                .catch(err => done(JSON.stringify(err)));
        });
    });

    describe('Invoices', function() {

        it('should retrieve invoices information iterate per page promise.', function(done) {
            var params = {
                perPage: true,
                page: {
                    size: 20
                }
            };

            console.info("Invoices".green);
            listPromise(client.listInvoices, params, done);
        });

        it('should retrieve account invoice information iterate per item promise.', function(done) {
            var params = {
                page: {
                    size: 3
                },
                account_code: testAccountCode
            };

            console.info("Account Invoices".green);
            client.listAccountInvoices(params)
                .then(function(invoice) {
                    console.info(JSON.stringify(invoice));
                    done();
                })
                .catch(function(err) {
                    done(JSON.stringify(err));
                });
        });
    });
});

//#region Generic

function listCallback(fn, params, done) {

    var count = 0;
    var now = new Date();

    if(params.perPage) {
        console.info('Callback List Pages');

        fn(params, function processPage(err, page) {
            if(page){
                count++;
                var interval = ((new Date()) - now) / 1000;
                console.info(('Page: #' + count + ' Records: ' + page.items.length + ' Processing Time Interval: ' + interval + ' secs.').green);
                //console.info(JSON.stringify(page));
                now = new Date();

                page.next(processPage);
            } else if(err) {
                done(JSON.stringify(err));
            } else {
                done();
            }
        });
    } else {
        console.info('Callback List Items');

        fn(params, function processItem(err, item) {
            if(item) {
                count++;
                var interval = ((new Date()) - now) / 1000;
                console.info(('Item: #' + count + ' in ' + interval + ' secs.').green);
                console.info(JSON.stringify(item));
                now = new Date();
                item.next(processItem);
            } else if(err) {
                done(JSON.stringify(err));
            } else {
                done();
            }
        });
    }
}

function listPromise(fn, params, done) {

    var count = 0;
    var now = new Date();

    if(params.perPage) {
        console.info('Promise List Pages');
        fn(params)
        .then(function processPage(page) {
            if(page) {
                count += 1;
                var interval = ((new Date()) - now) / 1000;
                console.info(('Page: #' + count + ' Records: ' + page.items.length + ' Processing Time Interval: ' + interval + ' secs.').green);
                console.info(JSON.stringify(page));
                now = new Date();

                return page.next()
                .then(processPage);
            }
        })
        .then(done)
        .catch(function(err){
            done(JSON.stringify(err));
        });
    } else {
        console.info('Promise List Items');
        fn(params)
        .then(function processItem(item) {
            if(item) {
                count++;
                var interval = ((new Date()) - now) / 1000;
                console.info(('Item: #' + count + ' in ' + interval + ' secs.').green);
                //console.info(JSON.stringify(account));
                now = new Date();
                return item.next()
                .then(processItem);
            }
        })
        .then(done)
        .catch(function(err){
            done(JSON.stringify(err));
        });
    }
}

function getId(){
    var now = new Date();
    return Math.floor(Math.random() * 10) + parseInt(now.getTime()).toString(36).toUpperCase();
}

//#endregion
