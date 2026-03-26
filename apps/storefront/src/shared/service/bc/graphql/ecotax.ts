import { platform } from '@/utils/basicConfig';

import B3Request from '../../request/b3Fetch';

const ecoTaxCustomFieldValues = (productIds: number[]) => `query GetEcoTaxProductIds {
  site {
    products(entityIds: [${productIds}]) {
      edges {
        node {
          customFields(names: "ECOTAX_PRODUCT_ID") {
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

export const getEcoTaxCustomFieldValues = async (productIds: number[]): Promise<EcoTaxCustomFieldProductResponse[]> => {
  const res = platform === 'bigcommerce' ? (
    await B3Request.graphqlBC({
      query: ecoTaxCustomFieldValues(productIds),
    })
  ) : (
    await B3Request.graphqlBCProxy({
      query: ecoTaxCustomFieldValues(productIds),
    })
  );

  return res?.data?.site?.products?.edges;
};

export const getEcoTaxItemName = (productName: string) => {
    return `Eco Participation - ${productName}`;
};

export interface EcoTaxCustomFieldProductResponse {
  node: EcoTaxCustomFieldProductResponseNode;
}

export interface EcoTaxCustomFieldProductResponseNode {
  customFields: EcoTaxCustomFieldProductResponseCustomFields;
  entityId: number;
  name: string;
}

export interface EcoTaxCustomFieldProductResponseCustomFields {
  edges: EcoTaxCustomFieldProductResponseCustomFieldsEdge[];
}

export interface EcoTaxCustomFieldProductResponseCustomFieldsEdge {
  node: EcoTaxCustomFieldProductResponseCustomFieldsEdgeNode;
}
export interface EcoTaxCustomFieldProductResponseCustomFieldsEdgeNode {
  name: string;
  value: string;
}