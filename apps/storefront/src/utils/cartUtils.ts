import Cookies from 'js-cookie';

import { dispatchEvent } from '@/hooks/useB2BCallback';
import { addNewLineToCart, createNewCart, getCart } from '@/shared/service/bc/graphql/cart';

import { LineItem, StorefrontAPILineItem } from './b3Product/b3Product';
import { EcoTaxCustomFieldProductResponse, getEcoTaxCustomFieldValues, getEcoTaxItemName } from '@/shared/service/bc/graphql/ecotax';
import { snackbar } from '@/utils/b3Tip';
import { getStorefrontAPIUrl } from '@/shared/service/request/base';
import { storeHash } from '@/utils/basicConfig';

const handleSplitOptionId = (id: string | number) => {
  if (typeof id === 'string' && id.includes('attribute')) {
    const idRight = id.split('[')[1];

    const optionId = idRight.split(']')[0];
    return Number(optionId);
  }

  if (typeof id === 'number') {
    return id;
  }

  return undefined;
};

const cartLineItems = (products: any) => {
  const items = products.map((product: any) => {
    const { newSelectOptionList, quantity, optionSelections, allOptions = [] } = product;
    let options = [];
    options = newSelectOptionList || optionSelections;
    const selectedOptions = options.reduce(
      (a: any, c: any) => {
        const optionValue = parseInt(c.optionValue, 10);
        const splitOptionId = handleSplitOptionId(c.optionId);
        const productOption = allOptions.find((option: CustomFieldItems) => {
          const id = option?.product_option_id || option?.id || '';
          return id === splitOptionId;
        });
        if (
          Number.isNaN(optionValue) ||
          productOption?.type === 'text' ||
          productOption?.type === 'Text field'
        ) {
          a.textFields.push({
            optionEntityId: splitOptionId,
            text: c.optionValue,
          });
        } else if (typeof optionValue === 'number') {
          a.multipleChoices.push({
            optionEntityId: splitOptionId,
            optionValueEntityId: parseInt(c.optionValue, 10),
          });
        }

        return a;
      },
      {
        multipleChoices: [],
        textFields: [],
      },
    );    

    return {
      quantity: parseInt(quantity || product.qty, 10),
      productEntityId: parseInt(product.productId || product.id, 10),
      variantEntityId: parseInt(product.variantId || product.products.variantId, 10),
      selectedOptions,
    };
  });

  return items;
};

const newDataCart = (productData: any) => ({
  createCartInput: {
    lineItems: cartLineItems(productData),
  },
});

export const deleteCartData = (entityId: any) => ({
  deleteCartInput: {
    cartEntityId: entityId,
  },
});

const getLineItemsData = (cartInfo: any, productData: any) => {
  const lineItems = cartLineItems(productData);

  return {
    addCartLineItemsInput: {
      cartEntityId: cartInfo.data.site.cart.entityId,
      data: {
        lineItems,
      },
    },
  };
};

export class CartError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CartError';
  }
}

const createNewShoppingCart = async (products: any) => {
  const cartData = newDataCart(products);
  
  const res = await createNewCart(cartData);
  if (res?.errors?.length) {
    throw new CartError(res.errors[0].message);
  }
  const { entityId } = res.data.cart.createCart.cart;
  Cookies.set('cartId', entityId);
  dispatchEvent('on-cart-created', {
    cartId: entityId,
  });
  return res;
};

export const updateCart = async (cartInfo: any, productData: any) => {
  const newItems = getLineItemsData(cartInfo, productData);
  const res = await addNewLineToCart(newItems);

  if (res?.errors?.length) {
    throw new CartError(res.errors[0].message);
  }

  return res;
};

export const createOrUpdateExistingCart = async (lineItems: LineItem[] | CustomFieldItems[]) => {
  const cartInfo = await getCart();

  const res = cartInfo?.data?.site?.cart
    ? await updateCart(cartInfo, lineItems)
    : await createNewShoppingCart(lineItems);

  return res;
};

const createNewShoppingCartCustom = async (productData: StorefrontAPILineItem[], createCartLineItems: LineItem[] | CustomFieldItems[]) => { 
  // Create a cart using just the first line item with GQL
  // This is to circumvent a bug when creating a cart with the storefront API
  const createCartRes = await createNewShoppingCart([createCartLineItems[0]]);
  const cartId = createCartRes.data.cart.createCart.cart.entityId;

  // Remove the first item from the product array, as this was added already at cart creation
  productData.shift();
  const reqBody = {
    line_items: productData
  };
  
  const res = await fetch(getStorefrontAPIUrl(window.location.hostname) + `/v3/carts/${cartId}/items`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
  })
  .then(res => res.json())
  .catch(err => err)

  if (!res.data.id) {
    return res;
  };

  return res;
};

export const updateCartCustom = async (cartInfo: any, productData: StorefrontAPILineItem[]) => {
  const cartId = cartInfo?.data?.site?.cart?.entityId;
  const reqBody = {
    line_items: productData
  };
  
  return fetch(getStorefrontAPIUrl(window.location.hostname) + `/v3/carts/${cartId}/items`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
          'Content-Type': 'application/json'
      },
      body: JSON.stringify(reqBody)
  })
  .then(res => res.json())
  .catch(err => err)
};

export const createOrUpdateExistingCartCustom = async (lineItems: StorefrontAPILineItem[], createCartLineItems: LineItem[] | CustomFieldItems[]) => {
  const productIds: number[] = [];
  const _lineItems: StorefrontAPILineItem[] = [...lineItems];

  // Fetch any ecotax product id's for applicable products
  _lineItems.forEach((item) => productIds.push(item.product_id));
  const ecoTaxCustomFieldResponse: EcoTaxCustomFieldProductResponse[] = await getEcoTaxCustomFieldValues(productIds);

  if (!ecoTaxCustomFieldResponse || !ecoTaxCustomFieldResponse.length) {
    snackbar.error('failed');
    return;
  } 
  
  // Loop through products in the ecotax response
  ecoTaxCustomFieldResponse.forEach((productData) => {
    // Check for ecotax product ID custom field
    if (productData.node.customFields.edges.length > 0) {
      const ecoTaxProductData = productData.node.customFields.edges[0].node;
      let baseProductIndex: number | null = null;
      let baseProductData: StorefrontAPILineItem | null = null;
      let baseProductName: string | null = null;

      // Find the index and data for the base product the ecotax is attached to
      _lineItems.forEach((item, index) => {
        if (item.product_id === productData.node.entityId) {
          baseProductIndex = index;
          baseProductData = item;
          baseProductName = productData.node.name;
        };
      });

      // Add ecotax product to the line item array after the base product it's attached to
      if (baseProductIndex !== null && baseProductData && baseProductName) {        
        _lineItems.splice(baseProductIndex + 1, 0, {
          product_id: parseInt(ecoTaxProductData.value),
          // @ts-expect-error
          quantity: baseProductData?.quantity,
          name: getEcoTaxItemName(baseProductName)
        })
      };
    }
  });

  const cartInfo = await getCart();
  
  const res = cartInfo?.data?.site?.cart
    ? await updateCartCustom(cartInfo, _lineItems)
    : await createNewShoppingCartCustom(_lineItems, createCartLineItems);

  return res;
};

