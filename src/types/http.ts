export type Ok<T> = { ok: true; data: T };
export type Fail = { ok: false; error: string };
export type ApiResult<T> = Ok<T> | Fail;

export const ok = <T>(data: T): Ok<T> => ({ ok: true, data });
export const fail = (error: string): Fail => ({ ok: false, error });
