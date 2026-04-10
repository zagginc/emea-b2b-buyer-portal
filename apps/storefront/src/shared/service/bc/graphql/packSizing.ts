import { platform } from '@/utils/basicConfig';

import B3Request from '../../request/b3Fetch';

const packSizeCustomFieldValues = (productIds: number[]) => `query GetPackSizes {
  site {
    products(entityIds: [${productIds}]) {
      edges {
        node {
          customFields(names: "PACK_SIZE") {
            edges {
              node {
                name
                value
              }
            }
          }
          entityId
          name
        }
      }
    }
  }
}`;

export const getPackSizeData = async (productIds: number[]): Promise<PackSizeData[]> => {
  const res = platform === 'bigcommerce' ? (
    await B3Request.graphqlBC({
      query: packSizeCustomFieldValues(productIds),
    })
  ) : (
    await B3Request.graphqlBCProxy({
      query: packSizeCustomFieldValues(productIds),
    })
  );

  if (res?.data?.site?.products?.edges) {
    return res?.data?.site?.products?.edges.map((item: PackSizeCustomFieldProductResponse) => {
      if (item.node.customFields.edges.length) {
        return ({
          name: item.node.name,
          id: item.node.entityId,
          packSize: parseInt(item.node.customFields.edges[0].node.value)
        })
      } else {
        return ({
          name: item.node.name,
          id: item.node.entityId,
        })
      }
    });
  } else {
    return [];
  }
};

export const isQuantityPackCompliant = (quantity: number, packSize: number) => {
  return quantity % packSize === 0 ? true : false;
}

export interface PackSizeData {
  name: string;
  id: number;
  packSize?: number;
}

export interface PackSizeCustomFieldProductResponse {
  node: PackSizeCustomFieldProductResponseNode;
}

export interface PackSizeCustomFieldProductResponseNode {
  customFields: PackSizeCustomFieldProductResponseCustomFields;
  entityId: number;
  name: string;
}

export interface PackSizeCustomFieldProductResponseCustomFields {
  edges: PackSizeCustomFieldProductResponseCustomFieldsEdge[];
}

export interface PackSizeCustomFieldProductResponseCustomFieldsEdge {
  node: PackSizeCustomFieldProductResponseCustomFieldsEdgeNode;
}
export interface PackSizeCustomFieldProductResponseCustomFieldsEdgeNode {
  name: string;
  value: string;
}