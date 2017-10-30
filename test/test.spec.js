'use strict';

let mock = require('mock-require'),
    expect = require('chai').expect,
    path = require('path'),
    jp = require('jsonpath'),
    decache = require('decache'),
    mute = require('mute'),
    unmute;

describe('Artillery Influx DB plug-in must report results when provided.', function() {
    let influxConstructorCalled,
        influxWriteInvocations,
        onEventHooks;

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

    decache('../lib/influxdb.js');

    const Plugin = require(path.join(__dirname, '../lib/influxdb.js'));

    function createPluginInstance() {
        // after setting up the mock for 'influx' load the module under test.
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

    function reportLatenciesNewSchema(latencies, errors) {
        // Simulate artillery results event by calling into the report function
        onEventHooks[0].actualReportFunction({
            _entries: latencies,
            _errors: errors
        });
    }

    before(function() {
        unmute = mute(process.stderr);
    });

    beforeEach(function() {
        onEventHooks = [];
        createPluginInstance();
        influxWriteInvocations = [];
        influxConstructorCalled = false;
    });

    after(function() {
        unmute();
        mock.stopAll();
    });

    it('registers for the stats event on the event emitter', function() {
        expect(onEventHooks[0].actualEventName).to.equal('stats');
        /*jshint -W030 */
        expect(onEventHooks[0].actualReportFunction).to.not.be.null;
        expect(onEventHooks[0].actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */
    });

    it('will not write latencies if none exist', function() {
        /*jshint -W030 */
        expect(onEventHooks[0].actualReportFunction).to.not.be.null;
        expect(onEventHooks[0].actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */

        reportLatencies([]);

        /*jshint -W030 */
        expect(influxWriteInvocations.length).to.equal(1);
        /*jshint +W030 */
    });

    it('uses influx to write results once stats event is raised', function() {
        /*jshint -W030 */
        expect(onEventHooks[0].actualReportFunction).to.not.be.null;
        expect(onEventHooks[0].actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */

        reportLatencies([]);

        /*jshint -W030 */
        expect(influxWriteInvocations.length).to.equal(1);
        /*jshint +W030 */
    });

    it('uses influx to write results once stats event is raised - supports updated schema', function() {
        /*jshint -W030 */
        expect(onEventHooks[0].actualReportFunction).to.not.be.null;
        expect(onEventHooks[0].actualReportFunction).to.not.be.undefined;
        /*jshint +W030 */

        reportLatenciesNewSchema([]);

        /*jshint -W030 */
        expect(influxWriteInvocations.length).to.equal(1);
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

    it('will not raise an exception if an error is not returned when reporting from InfluxDB when new schema is used', function() {
        reportLatenciesNewSchema([]);

        expect(function() {
            influxWriteInvocations[0].callback(null);
        }).to.not.throw();
    });

    it('uses the configured measurementName when reporting latencies to InfluxDB', function() {
        reportLatencies([]);

        expect(function() {
            influxWriteInvocations[0].callback(null);
        }).to.not.throw();

        expect(jp.query(influxWriteInvocations, `$[?(@.measurementName=="testMeasurementName")]`).length).to.equal(1);
    });

    it('does not report errors to Influx if none are reported', function() {
        reportLatencies([]);

        influxWriteInvocations[0].callback(null);

        expect(influxWriteInvocations.length).to.equal(1);
    });

    it('uses the default error measurement name when reporting errors to InfluxDB', function() {
        reportLatencies([], { ERROR: 1 });

        influxWriteInvocations[0].callback(null);

        expect(jp.query(influxWriteInvocations, `$[?(@.measurementName=="clientErrors")]`).length).to.equal(1);
    });

    it('reports both points and errors to InfluxDB', function() {
        reportLatencies([], { ERROR: 1 });

        influxWriteInvocations[0].callback(null);

        expect(jp.query(influxWriteInvocations, `$[?(@.measurementName=="clientErrors")]`).length).to.equal(1);
        expect(jp.query(influxWriteInvocations, `$[?(@.measurementName=="testMeasurementName")]`).length).to.equal(1);
        expect(influxWriteInvocations.length).to.equal(2);
    });

    it('properly reports default latency metric fields and tags', function() {
        reportLatencies([]);

        influxWriteInvocations[0].callback(null);

        expect(influxWriteInvocations.length).to.equal(1);
    });
});
