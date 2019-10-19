"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const Either_1 = require("fp-ts/lib/Either");
const scheduler_1 = require("@most/scheduler");
const bluebird_1 = require("bluebird");
const mongoose_1 = require("mongoose");
const streamadapter_1 = require("./lib/streamadapter");
const util_1 = require("util");
class ServiceOutbox {
    constructor(collectionName, schema, config) {
        this.config = config;
        const options = {
            discriminatorKey: 'type',
            capped: {
                size: config && config.size ? config.size : (1024 * 2),
                max: config && config.max ? config.max : 1000
            }
        };
        const messageSchema = new mongoose_1.Schema({
            type: {
                type: String,
                required: true
            },
            created: {
                type: Date,
                default: Date.now,
                index: true
            }
        }, options);
        this.messageModel = mongoose_1.model(collectionName, messageSchema);
        this.models = Object.keys(schema).reduce((models, type) => {
            return {
                ...models,
                [type]: this.messageModel.discriminator(type, new mongoose_1.Schema(schema[type], options))
            };
        }, {});
    }
    async put(message, session, opts) {
        let out = [];
        if (util_1.isArray(message)) {
            for (const messageItem of message)
                out = [...out, ...await this.models[messageItem.type].create([messageItem], { session })];
        }
        else {
            out = await this.models[message.type].create([message], { session });
        }
        if (opts && opts.autoCommit)
            await session.commitTransaction();
        return out;
    }
    tail(after) {
        const scheduler = scheduler_1.newDefaultScheduler();
        const [pushEvent, stream$] = streamadapter_1.createAdapter();
        const awaitInterval = this.config && this.config.awaitInterval ? this.config.awaitInterval : 200;
        let cursor;
        const openDatabaseTail = async () => {
            const count = await this.messageModel.countDocuments();
            if (count === 0) {
                await bluebird_1.delay(awaitInterval);
                return openDatabaseTail();
            }
            const query = after ? {
                created: {
                    $gt: after
                }
            } : undefined;
            cursor = this.messageModel
                .find(query)
                .tailable()
                .cursor()
                .on('data', document => pushEvent(Either_1.right(document)))
                .on('error', error => {
                if (error.message.toLowerCase().match('no more documents in tailed cursor'))
                    setTimeout(openDatabaseTail, awaitInterval);
                else
                    pushEvent(Either_1.left(error));
            })
                .on('close', () => pushEvent(Either_1.right("end")));
        };
        const close = async () => {
            pushEvent(Either_1.right("end"));
            if (cursor)
                await cursor.close();
        };
        setImmediate(openDatabaseTail);
        return [stream$, scheduler, close];
    }
}
exports.ServiceOutbox = ServiceOutbox;
