import * as YAML from 'js-yaml'
import { API_KIND_SPECIFICATION_EXTENSION } from '../../src'

export type ApiKindValue = 'undefined' | 'BWC' | 'no-BWC'

function applyApiKind(obj: Record<string, unknown>, apiKind: ApiKindValue): void {
  if (apiKind !== 'undefined') {
    obj[API_KIND_SPECIFICATION_EXTENSION] = apiKind
  }
}

export function generateAsyncApiSpec(
  channelApiKind: ApiKindValue = 'undefined',
  operationApiKind: ApiKindValue = 'undefined',
  payloadType: string = 'number',
): string {
  const channel: Record<string, unknown> = {
    address: 'channel1',
    messages: { message1: { $ref: '#/components/messages/message1' } },
  }
  applyApiKind(channel, channelApiKind)

  const operation: Record<string, unknown> = {
    action: 'receive',
    channel: { $ref: '#/channels/channel1' },
    messages: [{ $ref: '#/channels/channel1/messages/message1' }],
  }
  applyApiKind(operation, operationApiKind)

  return YAML.dump({
    asyncapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    channels: { channel1: channel },
    operations: { operation1: operation },
    components: {
      messages: {
        message1: {
          payload: {
            type: 'object',
            properties: { userId: { type: payloadType } },
          },
        },
      },
    },
  })
}

export function generateAsyncApiTwoOperationsSpec(
  channelApiKind: ApiKindValue,
  operationApiKind: ApiKindValue,
): string {
  const channel: Record<string, unknown> = {
    address: 'channel1',
    messages: {
      message1: { $ref: '#/components/messages/message1' },
      message2: { $ref: '#/components/messages/message2' },
    },
  }
  applyApiKind(channel, channelApiKind)

  const operation2: Record<string, unknown> = {
    action: 'receive',
    channel: { $ref: '#/channels/channel1' },
    messages: [{ $ref: '#/channels/channel1/messages/message2' }],
  }
  applyApiKind(operation2, operationApiKind)

  return YAML.dump({
    asyncapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    channels: { channel1: channel },
    operations: {
      operation1: {
        action: 'receive',
        channel: { $ref: '#/channels/channel1' },
        messages: [{ $ref: '#/channels/channel1/messages/message1' }],
      },
      operation2: operation2,
    },
    components: {
      messages: {
        message1: { payload: { type: 'object', properties: { userId: { type: 'number' } } } },
        message2: { payload: { type: 'object', properties: { orderId: { type: 'number' } } } },
      },
    },
  })
}

export function generateAsyncApiTwoChannelsSpec(
  channelApiKind: ApiKindValue,
  operationApiKind: ApiKindValue,
): string {
  const channel2: Record<string, unknown> = {
    address: 'channel2',
    messages: { message2: { $ref: '#/components/messages/message2' } },
  }
  applyApiKind(channel2, channelApiKind)

  const operation2: Record<string, unknown> = {
    action: 'receive',
    channel: { $ref: '#/channels/channel2' },
    messages: [{ $ref: '#/channels/channel2/messages/message2' }],
  }
  applyApiKind(operation2, operationApiKind)

  return YAML.dump({
    asyncapi: '3.0.0',
    info: { title: 'Test', version: '1.0.0' },
    channels: {
      channel1: { address: 'channel1', messages: { message1: { $ref: '#/components/messages/message1' } } },
      channel2: channel2,
    },
    operations: {
      operation1: {
        action: 'receive',
        channel: { $ref: '#/channels/channel1' },
        messages: [{ $ref: '#/channels/channel1/messages/message1' }],
      },
      operation2: operation2,
    },
    components: {
      messages: {
        message1: { payload: { type: 'object', properties: { userId: { type: 'number' } } } },
        message2: { payload: { type: 'object', properties: { orderId: { type: 'number' } } } },
      },
    },
  })
}
