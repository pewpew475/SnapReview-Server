import { Request, Response, NextFunction } from 'express';
import { createError } from './errorHandler.js';

export function validateBody(requiredFields: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return next(createError(
        `Missing required fields: ${missingFields.join(', ')}`,
        400
      ));
    }
    
    next();
  };
}

export function validateParams(requiredParams: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    const missingParams = requiredParams.filter(param => !req.params[param]);
    
    if (missingParams.length > 0) {
      return next(createError(
        `Missing required parameters: ${missingParams.join(', ')}`,
        400
      ));
    }
    
    next();
  };
}

export function validateUUID(field: string, source: 'body' | 'params' = 'body') {
  return (req: Request, res: Response, next: NextFunction) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const value = source === 'body' ? req.body[field] : req.params[field];
    
    if (value && !uuidRegex.test(value)) {
      return next(createError(`Invalid UUID format for ${field}`, 400));
    }
    
    next();
  };
}

