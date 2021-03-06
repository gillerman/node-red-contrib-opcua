/**

 Copyright 2017

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.

 **/

module.exports = function (RED) {
    "use strict";
    var opcua = require('node-opcua');
    var async = require("async");

    function OpcUaBrowserNode(config) {

        RED.nodes.createNode(this, config);

        this.item = config.item;         // OPC UA address: ns=2;i=4 OR ns=3;s=MyVariable
        this.datatype = config.datatype; // String;
        this.topic = config.topic;       // ns=3;s=MyVariable from input
        this.items = config.items;

        var node = this;

        var browseTopic = "ns=0;i=85";

        var opcuaEndpoint = RED.nodes.getNode(config.endpoint);

        node.status({fill: "gray", shape: "dot", text: "no Items"});

        node.add_item = function (item) {
            if (item) {
                node.items.add({'item': item});
            }
        };

        function setupClient(url, callback) {

            // new OPC UA Client and browse from Objects ns=0;s=Objects
            var browseClient = new opcua.OPCUAClient();
            var browseSession;

            async.series([
                // First connect to server´s endpoint
                function (callback) {
                    browseClient.connect(url, callback);
                    node.log("start browse client on " + opcuaEndpoint.endpoint);
                },
                function (callback) {
                    browseClient.createSession(function (err, session) {
                        if (!err) {
                            browseSession = session;
                            node.log("start browse session on " + opcuaEndpoint.endpoint);
                            callback();
                        }
                        else {
                            callback(err);
                        }
                    });
                },
                // step 3 : browse
                function (callback) {
                    node.warn("browseTopic:" + browseTopic);
                    browseSession.browse(browseTopic, function (err, browse_result) {
                        if (!err) {
                            browse_result.forEach(function (result) {
                                result.references.forEach(function (reference) {
                                    node.add_item(reference);
                                });
                            });
                        }

                        node.status({fill: "green", shape: "dot", text: "Items: " + node.items.length});

                        callback(err);
                    });
                },
                // close session
                function (callback) {

                    node.warn("sending items " + node.items.length);
                    var msg = {payload: node.items, endpoint: opcuaEndpoint.endpoint};
                    node.send(msg);

                    node.warn("close browse session");
                    browseSession.close(function (err) {
                        if (err) {
                            node.error("session closed failed on browse");
                        }
                        callback(err);
                    });
                }
            ], function (err) {
                if (err) {
                    browseSession = null;
                    browseClient = null;
                    callback(err);
                }
            });
        }

        setupClient(opcuaEndpoint.endpoint, function (err) {
            if (err) {
                node.error(err);
                node.status({fill: "red", shape: "dot", text: "Error Items: " + node.items.length});
            }

            node.log("Browse loading Items done ...");
        });

        node.on("input", function (msg) {

            browseTopic = null;

            node.warn("input browser");

            if (msg.payload.hasOwnProperty('actiontype')) {

                switch (msg.payload.actiontype) {
                    case 'browse':
                        if (msg.payload.hasOwnProperty('root')) {
                            if (msg.payload.root && msg.payload.root.hasOwnProperty('item')) {
                                if (msg.payload.root.item.hasOwnProperty('nodeId')) {
                                    browseTopic = browse_by_item(msg.payload.root.item.nodeId);
                                }
                            }
                        }
                        break;

                    default:
                        break;
                }
            }
            else {
                if (!node.topic && msg.topic) {
                    if (msg.topic) {
                        browseTopic = msg.topic;
                    }
                }
                else {
                    browseTopic = node.topic;
                }
            }

            node.items = []; // clear items - TODO: may it becomes usable in Edit window of the node

            if (!browseTopic) {
                browseTopic = browse_to_root();
            }

            setupClient(opcuaEndpoint.endpoint, function (err) {
                if (err) {
                    node.error(err);
                    node.status({fill: "red", shape: "dot", text: "Error Items: " + node.items.length});
                }
                node.log("Browse loading Items done ...");
            });

            msg.endpoint = opcuaEndpoint.endpoint;
            msg.payload = node.items;

            node.send(msg);
        });

        function browse_by_item(nodeId) {
            node.log("Browse to root " + nodeId);
            return nodeId;
        }


        function browse_to_root() {
            node.warn("Browse to root Objects");
            return "ns=0;i=85"; // OPC UA Root Folder Objects
        }
    }

    RED.nodes.registerType("OpcUa-Browser", OpcUaBrowserNode);
};
