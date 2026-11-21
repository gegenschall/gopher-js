export const unavailable = (): never => {
  throw new Error('The Gopher client TCP transport is not implemented yet.');
};

export const request = async (): Promise<never> => unavailable();
