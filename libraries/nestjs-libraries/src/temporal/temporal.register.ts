import { Global, Injectable, Module, OnModuleInit } from '@nestjs/common';
import { TemporalService } from 'nestjs-temporal-core';
import { Connection } from '@temporalio/client';
import {
  organizationId,
  postId,
} from '@contentfactory/nestjs-libraries/temporal/temporal.search.attribute';

// `temporal.api.enums.v1.IndexedValueType` on the wire. The SDK keeps its
// encoder internal, so the two values this product registers are spelled out.
const INDEXED_VALUE_TYPE: Record<string, number> = {
  TEXT: 1,
  KEYWORD: 2,
};

/**
 * The same enum reaches us as a number or as one of its two spellings,
 * depending on how the client decoded the response. Comparing against all
 * three keeps a healthy namespace from being reported as mistyped.
 */
function isType(registered: unknown, type: string) {
  return (
    registered === INDEXED_VALUE_TYPE[type] ||
    registered === type ||
    registered === `INDEXED_VALUE_TYPE_${type}`
  );
}

// The single source of truth for both halves of the contract: the workflows
// attach these keys, and this module registers exactly the same names and
// types with the server.
const REQUIRED_ATTRIBUTES = [organizationId, postId];

@Injectable()
export class TemporalRegister implements OnModuleInit {
  constructor(private _client: TemporalService) {}

  async onModuleInit(): Promise<void> {
    if (process.env.TEMPORAL_TLS === 'true') {
      return;
    }
    const namespace = process.env.TEMPORAL_NAMESPACE || 'default';
    const connection = this._client?.client?.getRawClient()
      ?.connection as Connection;

    const { customAttributes } =
      await connection.operatorService.listSearchAttributes({ namespace });

    const missingAttributes = REQUIRED_ATTRIBUTES.filter(
      (attribute) => !customAttributes[attribute.name]
    );

    // An attribute that exists with the wrong type is worse than a missing
    // one: registration silently succeeds, then every workflow start fails
    // deep inside the SDK. Say what is wrong while the name is still in hand.
    const mistyped = REQUIRED_ATTRIBUTES.filter(
      (attribute) =>
        customAttributes[attribute.name] &&
        !isType(customAttributes[attribute.name], attribute.type)
    );
    if (mistyped.length) {
      throw new Error(
        `Temporal namespace "${namespace}" already registers ${mistyped
          .map((attribute) => attribute.name)
          .join(', ')} with another type. Remove the attribute there, or point ` +
          'this instance at a namespace that does not.'
      );
    }

    if (missingAttributes.length > 0) {
      await connection.operatorService.addSearchAttributes({
        namespace,
        searchAttributes: missingAttributes.reduce((all, attribute) => {
          all[attribute.name] = INDEXED_VALUE_TYPE[attribute.type];
          return all;
        }, {} as Record<string, number>),
      });
    }
  }
}

@Global()
@Module({
  imports: [],
  controllers: [],
  providers: [TemporalRegister],
  get exports() {
    return this.providers;
  },
})
export class TemporalRegisterMissingSearchAttributesModule {}
