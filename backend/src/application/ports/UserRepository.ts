export interface UserInfo {
  id: string;
  name: string;
  image?: string | null;
}

export interface UserRepository {
  findById(userId: string): Promise<UserInfo | null>;
  findManyByIds(userIds: string[]): Promise<UserInfo[]>;
}
