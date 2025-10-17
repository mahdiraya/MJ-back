import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'super_secret_jwt_key',
    });
  }

  async validate(payload: any) {
    // You can attach more user info here if needed
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  }
}
