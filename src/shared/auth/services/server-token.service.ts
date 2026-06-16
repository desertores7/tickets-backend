// import { HttpService } from "@nestjs/axios";
// import { Injectable } from "@nestjs/common";
// import { AxiosResponse } from "axios";
// import { EnvService } from "@config/env/env.service";

// @Injectable()
// export class ServerTokenService {
//   constructor(private readonly httpService: HttpService, private readonly envService: EnvService) {}
//   private tokenSingleton = { serverAccessToken: '' };

//   async getNewServerToken(): Promise<AxiosResponse<{ access_token: string }>> {
//     const formData = new URLSearchParams();

//     const secret = this.envService.get('CLIENT_SECRET');

//     formData.append('client_id', this._clientId);
//     formData.append('client_secret', secret);
//     formData.append('grant_type', 'client_credentials');

//     const response = await this.httpService.axiosRef.post(`${this._auth_api_url}/server/login`, formData.toString(), {
//       headers: {
//         'Content-Type': 'application/x-www-form-urlencoded'
//       }
//     });

//     return response;
//   }

//   async getServerToken(): Promise<string> {
//     try {
//       if (
//         !this.tokenSingleton.serverAccessToken ||
//         !(await this.validateServerToken(this.tokenSingleton.serverAccessToken))
//       ) {
//         this.tokenSingleton.serverAccessToken = (await this.getNewServerToken()).data?.access_token;
//       }

//       this.tokenSingleton.serverAccessToken = this.tokenSingleton.serverAccessToken;

//       return this.tokenSingleton.serverAccessToken;
//     } catch (error) {
//       console.log('error "getServerToken": ', error);
//       throw new InternalServerErrorException('Internal Error');
//     }
//   }

//   async validateServerToken(token: string): Promise<boolean> {
//     const publicKey: string = await this.getCertificate();
//     let invalidToken = false;
//     try {
//       const payload = await this.jwtService.verifyAsync(token, { publicKey });
//       if (payload) {
//         invalidToken = true;
//       }
//     } catch (error) {
//       console.log('error "validateServerToken": ', error);
//     }
//     return invalidToken;
//   }

// }
