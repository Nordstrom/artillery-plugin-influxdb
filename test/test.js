'use strict';

var mock = require('mock-require'),
    expect = require('chai').expect,
    path = require('path'),
    Plugin,
    writePointsArguments,
    influxConstructorCalled;

mock('influx', function() {
    influxConstructorCalled = true;

    return {
        writePoints: function(testName, points, callback) {
            writePointsArguments = {
                testName: testName,
                points: points,
                callback: callback
            };
        }
    };
});

// after setting up the mock for 'influx' load the module under test.
Plugin = require(path.join(__dirname, '../lib/influxdb.js'));

describe('Artillery Influx DB plug-in must correctly validate configurations', function() {
    afterEach(function() {
        // Delete the cached configuration after each test
        delete Plugin.impl.config;

        // Delete environment variables created
        delete process.env[Plugin.constants.ENV_INFLUX_PASSWORD];
        delete process.env[Plugin.constants.ENV_INFLUX_USERNAME];
    });

    it('accepts a valid configuration', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();
    });

    it('accepts an uses old test_name configuration value', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                test_name: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();

        expect(Plugin.impl.config.testName).to.equal('this is a valid test name');
    });

    it('requires testName or test_name in the configuration', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).to.throw(Error, /testName/);
    });

    it('requires influx.host in the configuration', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).to.throw();
    });

    it('accepts username from the environment', function() {
        process.env[Plugin.constants.ENV_INFLUX_USERNAME] = 'a-user';

        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();
    });

    it('requires influx.username in the configuration or environment', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).to.throw(Error, /influx.username/);
    });

    it('accepts password from the environment', function() {
        process.env[Plugin.constants.ENV_INFLUX_PASSWORD] = 'p@ssw0rd';

        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();
    });

    it('requires influx.password in the configuration or environment', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    database: 'any-db-name'
                }
            });
        }).to.throw(Error, /influx.password/);
    });

    it('requires influx.database in the configuration', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd'
                }
            });
        }).to.throw(Error, /influx.database/);
    });

    it('will generate a testRunId if one is not provided', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();

        /*jshint -W030 */
        expect(Plugin.impl.config.tags.testRunId).not.to.be.undefined;
        expect(Plugin.impl.config.tags.testRunId).not.to.be.null;
        /*jshint +W030 */
        expect(Plugin.impl.config.tags.testRunId).to.be.a('string');
        expect(Plugin.impl.config.tags.testRunId.length).to.equal(36);
    });
});

describe('Artillery Influx DB plug-in must report results once testing is completed.', function() {
    var actualEventName,
        actualReportFunction;

    function createPluginInstance() {
        new Plugin({
                plugins: {
                    influxdb: {
                        testName: '45215-PERS-FDN-PreferredStore-Get-test-loadAndMonitor',
                        influx: {
                            host: 'ec2-52-10-71-7.us-west-2.compute.amazonaws.com',
                            username: 'artillery_reporter',
                            password: 'kmhpcs0cotpp',
                            database: 'artillery_metrics'
                        }
                    }
                }
            },
            {
                on: function(eventName, reportFunction) {
                    actualEventName = eventName;
                    actualReportFunction = reportFunction;
                }
            }
        );
    }

    beforeEach(function() {
        influxConstructorCalled = false;
        writePointsArguments = null;
    });

    afterEach(function() {
        // Delete the cached configuration before each test
        delete Plugin.impl.config;
    });

    it('registers for the done event on the event emitter', function() {
        createPluginInstance();

        expect(actualEventName).to.equal('done');
        /*jshint -W030 */
        expect(actualReportFunction).to.not.be.null;
        expect(actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */
    });

    it('uses influx to write results once done event is raised', function() {
        createPluginInstance();

        /*jshint -W030 */
        expect(actualReportFunction).to.not.be.null;
        expect(actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */

        // Simulate the done event by calling into the report function
        actualReportFunction({
            aggregate: {
                latencies: []
            }
        });

        /*jshint -W030 */
        expect(writePointsArguments).to.not.be.null;
        /*jshint +W030 */
    });

    it('will raise an exception if an error is returned', function() {
        createPluginInstance();

        // Simulate the done event by calling into the report function
        actualReportFunction({
            aggregate: {
                latencies: []
            }
        });

        expect(function() {
            writePointsArguments.callback({ message: 'THIS IS AN ERROR' });
        }).to.throw(Error, /THIS IS AN ERROR/);
    });

    it('will not raise an exception if an error is not returned', function() {
        createPluginInstance();

        // Simulate the done event by calling into the report function
        actualReportFunction({
            aggregate: {
                latencies: []
            }
        });

        expect(function() {
            writePointsArguments.callback(null);
        }).to.not.throw();
    });
});
