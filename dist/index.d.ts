import { Stream, Scheduler } from '@most/types';
import { SchemaDefinition, Document, ClientSession } from 'mongoose';
export declare type TOutboxAbstractMessageType = {
    type: string;
    data: object;
};
export declare type TOutboxMessage<T extends TOutboxAbstractMessageType> = T & {
    created: Date;
};
export declare type TOutboxMessageScehma = {
    [type: string]: SchemaDefinition;
};
export declare type TServiceOutboxConfiguration = {
    size?: number;
    max?: number;
    awaitInterval?: number;
};
export declare class ServiceOutbox<T extends TOutboxAbstractMessageType, TM extends TOutboxMessage<T> = T & {
    created: Date;
}> {
    private messageModel;
    private models;
    private config?;
    constructor(collectionName: string, schema: TOutboxMessageScehma, config?: TServiceOutboxConfiguration);
    put(message: T | T[], session: ClientSession, opts?: {
        autoCommit: boolean;
    }): Promise<(TM & Document)[]>;
    tail(after?: Date): [Stream<TM>, Scheduler, () => void];
}
