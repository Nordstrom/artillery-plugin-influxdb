# artillery-plugin-influxdb
Plugin for Artillery.IO that records response data into InfluxDB.

To use:

1. `npm install -g artillery`
2. `npm install artillery-plugin-influxdb`
3. Add `influxdb` Plugin config to your "`hello.json`" Artillery script

    ```json
    {
      "config": {
        "plugins": {
            "influxdb": {
                "testName": "my_load_test_case",
                "measurementName": "Latency",
                "errorMeasurementName": "ClientSideErrors",
                "testRunId": "342-233-221",
                "tags": {
                    "environment": "joes-dev-box",
                    "host": "joe-dev.somewhere.org"
                },
                "influx": {
                    "host": "my.influx.server.com",
                    "username": "joe_developer",
                    "password": "1t`sA$3cr3t",
                    "database": "load_test_results"
                }
            }
        }
      }
    }
    ```

4. `artillery run hello.json`

This will cause every latency to be published to the given InfluxDB instance.

## Plug-In Configuration Options
|**Property**|**Required**|**Default**|**Meaning**|
:----------------|:----:|:---------------:|:--------|
`testName`        |*yes*|*none*  |Name of the test being performed.|
`measurementName` |*no*|**latency** |Measurement name used when writing latency to InfluxDB.|
`errorMeasurementName` |*no*|**clientErrors** |Errors raised by the Artillery client during the test.|
`testRunId` |*no*|**UUID** |Identifier used to associate individual test results with a given test run. If no `testRunId` property is provided, a UUID is generated for the test run.|
`tags` |*no*|*none* |Object map of static name-value pairs containing tags which are written with every measurement.|
`influx` |*yes*|*none*|Influx module configuration object, see select options below, see [full documentation](https://node-influx.github.io/class/src/index.js~InfluxDB.html#instance-constructor-constructor) for complete details.|
`influx.host` |*yes*|*none* |Network host name of the InfluxDB to which results should be written. **No protocol or port, just the host name.**|
`influx.port` |*no*|8086|Port on which the InfluxDB connection is to be opened.|
`influx.username` |*yes*\*|*none* |User account to use when logging results. |
`influx.password` |*yes*\*|*none* |Password to use when logging results. |
`influx.database` |*yes*|*none* |Influx Database name into which the results are written. |
`excludeTestRunId` |*no*|*none* |Set to true to prevent plugin from generating/logging testRunId UUID's automatically. |
`matches` |*no*|*none*|Send data regarding matches to InfluxDB with column name "matches"|

*see notes on using environment variables for these values below.

## Using environment variables to store credentials

The environment variables `INFLUX_USERNAME` and `INFLUX_PASSWORD` may be set instead of
passing 'username' and/or 'password' properties in the config file.

For more information, see:

* https://github.com/shoreditch-ops/artillery
* https://github.com/node-influx/node-influx

Enjoy!
