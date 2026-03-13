import { createClient } from 'smartsheet';

export default function createSmartsheet(accessToken) {
  return createClient({
    accessToken
  });
};