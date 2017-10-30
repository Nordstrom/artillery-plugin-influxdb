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
                },
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
`influx.host` |*yes*|*none* |Network host name of the InfluxDB to which results should be written. **No protocol or port, just the host name.**|
`influx.username` |*yes*\*|*none* |User account to use when logging results. |
`influx.password` |*yes*\*|*none* |Password to use when logging results. |
`influx.database` |*yes*|*none* |Influx Database name into which the results are written. |
`excludeTestRunId` |*no*|*none* |Set to true to prevent plugin from generating/logging testRunId UUID's automatically. |
`matches` |*no*|*none*|Send data regarding matches to InfluxDB with column name "matches". |
`measurements` |*no*|*see below*|Used to customize the information extracted from artillery and sent to Influx. |

*see notes on using environment variables for these values below.

## Using environment variables to store credentials

The environment variables `INFLUX_USERNAME` and `INFLUX_PASSWORD` may be set instead of
passing 'username' and/or 'password' properties in the config file.

## Custom Measurements

By default, the plugin sends the `latency` and `clientErrors` measurements to InfluxDB.
Here is the `measurements` configuration we use for these defaults:

```
"measurements": {
    "latency": {
        "granularity": "sample",
        "fields": {
            "queries": {
                "value": "$.sample[${constants.LATENCY}]",
                "matches": "$.testReport._matches",
                "time": "$.sample[${constants.TIMESTAMP}]"
            },
            "mappers": {
                "value": "v => v / 1000000"
            }
        },
        "tags": {
            "queries": {
                "response": "$.sample[${constants.STATUS_CODE}]"
            }
        }
    },
    "clientErrors": {
        "granularity": "report",
        "fields: {
            "queries: {
                "value": "$.testReport.errors.*"
            },
            "reducers": {
                "value": "(acc, value) => acc + value"
            },
            "defaults": {
                "time": "() => Date.now()"
            }
        }
    }
}
```

## Mesurement Definition Properties
|**Property**|**Required**|**Default**|**Meaning**|
:----------------|:----:|:---------------:|:--------|
`granularity`    |*yes*|*none*|Must be either "sample" or "report".|
`fields`         |*yes*|*none*|InfluxDB fields to use for the measurement.|
`tags`           |*no*|*none*|InfluxDB tags applied to the measurement.|
`queries`        |*yes*|*none*|[JSONPath](https://github.com/dchester/jsonpath) extracting field/tag data from Artillery report. Required for fields.|
`defaults`       |*no*|*none*|Alternative value provided when query against Artillery report returns no results. Sting, Number or Functions are allowed|
`mappers`        |*no*|*none*|Transforms individual query results. Must be a Function in the form [x => y](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map).|
`reducers`       |*no*|*none*|Folds multiple query results into single value. Must be a function in the form [(accumulator, item) => result](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce?v=a).|

The plugin uses measurement definitions to query field and tag values from
the Artillery `testReport` and send those to InfluxDB:

1. Read configuration file and check for the `measurements` property.
    If no `measurements` property is found, the defaults (_shown above_) are used.
2. Measurement definitions are parsed and their configurations are validated.
3. Every time Artillery sends a `stats` event, it sends a `testReport` containing
   (among other properties) an array of test samples named `latencies`.
4. Any measurement with `granularity=report` is provided the `testReport` for processing.
   Processed results are written to InfluxDB.
5. Each `sample` in the `testReport.latencies` is provided to any measurement with
   `granularity=sample` for processing and results for each written to InfluxDB.

Notice each measurement has the option to define both `fields` and `tags` for
InfluxDB time-series data. The `tags` are optional, but the `fields` must include
at least one property named `value` which is typically time.

### Measurement Processing Explained

Each measurement defines its own process by which data is queried from and transformed
into the desired shape and value. That process is defined by a few simple
steps:

#### *Query* => *Defaults* => *Map* => *Reduce*

Set the `DEBUG=*` environment variable to see it live when running an
 artillery test _(among all the other output!)_

#### 1 - Query

Every key in the `queries` property for a `field` or `tag` contains a
[JSONPath](https://github.com/dchester/jsonpath) query to use to probe the
`testReport` or each `sample` from the `testReport.latencies` property.

#### 2 - Defaults

Each key on the `defaults` property is either a *String*, *Number* or *Function* in the form
of *() => default* which is evaluated for the default. The default for a `field` or `tag`
is only used if the query did not return results.

#### 3 - Map

The keys in the `mappers` property name the `field` or `tag` to which to
apply the provided *Function* in the form
[*x => y*](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/map)
which is applied to each. Depending on the query result, each `field` or `tag`
may be single value or an array. In either case, the map is applied to every value.

#### 4 - Reduce

Finally any values in the `field` or `tag` specified by the keys of the
`reducers` property are consolidated using the provided function in the
form [(accumulator, item) => result](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/Reduce?v=a).

In the case of any un-reduced arrays of query results for `tags` or `fields`
the fist value is taken.

## More Info

For more information, see:

* [Artillery.IO](https://github.com/shoreditch-ops/artillery)
* [node-influx](https://github.com/node-influx/node-influx)

Enjoy!
