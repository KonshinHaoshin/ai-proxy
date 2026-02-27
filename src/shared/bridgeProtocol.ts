export type BridgeMethod =
  | 'VALIDATE_API_KEY'
  | 'DETECT_PROVIDER'
  | 'CHAT_WITH_AI'
  | 'GET_CONVERSATIONS'
  | 'GET_CONVERSATION';

export interface BridgeRequest<TParams = unknown> {
  kind: 'request';
  id: string;
  method: BridgeMethod;
  params: TParams;
}

export interface BridgeSuccessResponse<TResult = unknown> {
  kind: 'response';
  id: string;
  success: true;
  result: TResult;
}

export interface BridgeErrorResponse {
  kind: 'response';
  id: string;
  success: false;
  error: string;
}

export interface BridgeHello {
  kind: 'hello';
  role: 'extension' | 'server';
  version: string;
}

export type BridgeMessage =
  | BridgeRequest
  | BridgeSuccessResponse
  | BridgeErrorResponse
  | BridgeHello;
