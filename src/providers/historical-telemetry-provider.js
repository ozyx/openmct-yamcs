/*****************************************************************************
 * Open MCT, Copyright (c) 2014-2020, United States Government
 * as represented by the Administrator of the National Aeronautics and Space
 * Administration. All rights reserved.
 *
 * Open MCT is licensed under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * http://www.apache.org/licenses/LICENSE-2.0.
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
 * License for the specific language governing permissions and limitations
 * under the License.
 *
 * Open MCT includes source code licensed under additional open source
 * licenses. See the Open Source Licenses file (LICENSES.md) included with
 * this source code distribution or the Licensing information page available
 * at runtime from the About dialog for additional information.
 *****************************************************************************/
import * as OBJECT_TYPES from '../const';
import {
    idToQualifiedName,
    getValue,
    addLimitInformation
} from '../utils.js';

export default class YamcsHistoricalTelemetryProvider {
    constructor(url, instance) {
        this.url = url;
        this.instance = instance;
        this.supportedTypes = {};

        this.addSupportedTypes();
    }

    addSupportedTypes() {
        const types = Object.values(OBJECT_TYPES);
        types.forEach(type => {
            this.supportedTypes[type] = type;
        });
    }

    supportsRequest(domainObject) {
        return this.supportedTypes[domainObject.type];
    }

    request(domainObject, options) {
        return this.getHistory(domainObject.identifier.key, options);
    }

    getHistory(id, options) {
        const {
            start,
            end,
            size = 300,
            strategy
        } = options;

        // cap size at 1000, temporarily to prevent errors
        if (size > 1000) {
            size = 1000;
        }

        let url = `${this.url}api/archive/${this.instance}`;
        url += this.getLinkParamsSpecificToId(id);

        let order = 'asc';
        let sizeParam = 'limit';
        let convertHistory = (res) => this.convertPointHistory(id, res);
        if (strategy && strategy.toLowerCase() === 'latest') {
            size = 1;
            order = 'desc'
        } else if (strategy && strategy.toLowerCase() === 'minmax') {
            url += '/samples';
            sizeParam = 'count';
            convertHistory = (res) => this.convertSampleHistory(id, res);
        }

        url += `?start=${new Date(start).toISOString()}`;
        url += `&stop=${new Date(end).toISOString()}`;
        url += `&${sizeParam}=${size}`;
        url += `&order=${order}`;

        return fetch(encodeURI(url))
            .then(res => res.json())
            .then(convertHistory);
    }

    getLinkParamsSpecificToId(id) {
        if (id === OBJECT_TYPES.EVENTS_OBJECT_TYPE) {
            return '/events';
        }

        return '/parameters' + idToQualifiedName(id);
    }

    convertEventHistory(id, results) {
        if (!results.event) {
            return [];
        }

        return results.event.map(e => {
            return {
                id,
                ...e
            };
        });
    }

    convertPointHistory(id, results) {
        if (id === OBJECT_TYPES.EVENTS_OBJECT_TYPE) {
            return this.convertEventHistory(id, results);
        }

        if (!(results.parameter)) {
            return [];
        }

        let values = [];
        results.parameter.forEach(parameter => {
            let point = {
                id: parameter.id.name,
                timestamp: parameter.generationTimeUTC,
                value: getValue(parameter.engValue)
            };

            addLimitInformation(parameter, point);
            values.push(point);
        });

        return values;
    }

    convertSampleHistory(id, results) {
        if (!(results.sample)) {
            return [];
        }

        let values = [];
        results.sample.forEach(sample => {
            if (sample.n > 0) {
                let min_value = {
                    timestamp: sample.time,
                    value: sample.min,
                    id: id
                };

                addLimitInformation(sample, min_value);
                values.push(min_value);
            }

            if (sample.n > 1) {
                let max_value = {
                    timestamp: sample.time,
                    value: sample.max,
                    id: id
                };

                addLimitInformation(sample, max_value);
                values.push(max_value);
            }
        });

        return values;
    }
}
