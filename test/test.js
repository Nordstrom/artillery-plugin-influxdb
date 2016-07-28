'use strict';

var mock = require('mock-require'),
    expect = require('chai').expect,
    path = require('path'),
    Plugin,
    influxConstructorCalled,
    influxWriteInvocations;

mock('influx', function() {
    influxConstructorCalled = true;

    return {
        writePoints: function(measurementName, points, callback) {
            influxWriteInvocations.push({
                measurementName: measurementName,
                points: points,
                callback: callback
            });
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

    it('requires testName in the configuration', function() {
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

    it('supports a configurable measurementName', function() {
        expect(function() {
            Plugin.impl.validateConfig({
                testName: 'this is a valid test name',
                measurementName: 'testLatencies',
                influx: {
                    host: 'my-test-host-name',
                    username: 'a-user',
                    password: 'p@ssw0rd',
                    database: 'any-db-name'
                }
            });
        }).not.to.throw();

        expect(Plugin.impl.config.measurementName).to.equal('testLatencies');
    });
});

describe('Artillery Influx DB plug-in must report results once testing is completed.', function() {
    var onEventHooks;

    function createPluginInstance() {
        new Plugin({
                plugins: {
                    influxdb: {
                        testName: '45215-PERS-FDN-PreferredStore-Get-test-loadAndMonitor',
                        measurementName: 'testMeasurementName',
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
                on: function (eventName, reportFunction) {
                    onEventHooks.push({
                        actualEventName: eventName,
                        actualReportFunction: reportFunction
                    });
                }
            }
        );
    }

    function reportLatencies(latencies, errors) {
        // Simulate artillery results event by calling into the report function
        onEventHooks[0].actualReportFunction({
            latencies: latencies,
            errors: errors
        });
    }

    beforeEach(function() {
        influxWriteInvocations = [];
        onEventHooks = [];
        influxConstructorCalled = false;
        createPluginInstance();
    });

    afterEach(function() {
        // Delete the cached configuration before each test
        delete Plugin.impl.config;
    });

    it('registers for the stats event on the event emitter', function() {
        expect(onEventHooks[0].actualEventName).to.equal('stats');
        /*jshint -W030 */
        expect(onEventHooks[0].actualReportFunction).to.not.be.null;
        expect(onEventHooks[0].actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */
    });

    it('uses influx to write results once stats event is raised', function() {
        /*jshint -W030 */
        expect(onEventHooks[0].actualReportFunction).to.not.be.null;
        expect(onEventHooks[0].actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */

        reportLatencies([]);

        /*jshint -W030 */
        expect(influxWriteInvocations[0].points).to.not.be.null;
        /*jshint +W030 */
    });

    it('will raise an exception if an error is returned when reporting to InfluxDB', function() {
        reportLatencies([]);

        expect(function() {
            influxWriteInvocations[0].callback({ message: 'THIS IS AN ERROR' });
        }).to.throw(Error, /THIS IS AN ERROR/);
    });

    it('will not raise an exception if an error is not returned when reporting from InfluxDB', function() {
        reportLatencies([]);

        expect(function() {
            influxWriteInvocations[0].callback(null);
        }).to.not.throw();
    });

    it('uses the configured measurementName when reporting latencies to InfluxDB', function() {
        reportLatencies([]);

        expect(function() {
            influxWriteInvocations[0].callback(null);
        }).to.not.throw();

        expect(influxWriteInvocations[0].measurementName).to.equal('testMeasurementName');
    });

    it('does not report errors to Influx if none are reported', function() {
        reportLatencies([]);

        influxWriteInvocations[0].callback(null);

        expect(influxWriteInvocations.length).to.equal(1);
    });

    it('uses the default error measurement name when reporting errors to InfluxDB', function() {
        reportLatencies([], { ERROR: 1 });

        influxWriteInvocations[0].callback(null);

        expect(influxWriteInvocations[1].measurementName).to.equal('clientErrors');
    });

    it('reports both points and errors to InfluxDB', function() {
        reportLatencies([], { ERROR: 1 });

        influxWriteInvocations[0].callback(null);

        expect(influxWriteInvocations[0].measurementName).to.equal('testMeasurementName');
        expect(influxWriteInvocations[1].measurementName).to.equal('clientErrors');
        expect(influxWriteInvocations.length).to.equal(2);
    });
});
