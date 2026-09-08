/** Safe, stable problem information carried from a transport boundary failure. */
export interface HttpProblemDescriptor {
  readonly status: number;
  readonly type: string;
  readonly title: string;
  readonly detail: string;
  readonly code: string;
  readonly authenticate?: boolean;
}

/** Internal exception whose public payload contains no provider details. */
export class HttpBoundaryError extends Error {
  override readonly name = 'HttpBoundaryError';

  constructor(readonly problem: HttpProblemDescriptor) {
    super(problem.detail);
  }
}

export const authenticationRequired = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 401,
    type: 'https://omoikane.dev/problems/authentication-required',
    title: 'Authentication is required',
    detail: 'A valid bearer access token is required.',
    code: 'authentication_required',
    authenticate: true,
  });

export const authenticationUnavailable = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 503,
    type: 'https://omoikane.dev/problems/dependency-unavailable',
    title: 'A required service is unavailable',
    detail:
      'The request cannot be completed while authentication is unavailable.',
    code: 'dependency_unavailable',
  });

export const invalidRequest = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 400,
    type: 'https://omoikane.dev/problems/invalid-request',
    title: 'The request is invalid',
    detail: 'One or more request values are invalid.',
    code: 'invalid_request',
  });

export const resourceNotFound = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 404,
    type: 'https://omoikane.dev/problems/resource-not-found',
    title: 'The resource is not available',
    detail: 'The requested resource is not available.',
    code: 'resource_not_found',
  });

export const resourceConflict = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 409,
    type: 'https://omoikane.dev/problems/resource-conflict',
    title: 'The resource has changed',
    detail: 'The requested change conflicts with the current resource state.',
    code: 'resource_conflict',
  });

export const analysisUnavailable = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 503,
    type: 'https://omoikane.dev/problems/dependency-unavailable',
    title: 'A required service is unavailable',
    detail: 'The Analysis Run cannot be completed right now.',
    code: 'dependency_unavailable',
  });

export const invalidServerData = (): HttpBoundaryError =>
  new HttpBoundaryError({
    status: 500,
    type: 'https://omoikane.dev/problems/internal-error',
    title: 'The server could not complete the request',
    detail: 'An unexpected server error occurred.',
    code: 'internal_error',
  });
