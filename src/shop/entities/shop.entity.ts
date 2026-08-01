import { Column, Entity } from 'typeorm';
import { TimestampedEntity } from '../../common';

@Entity('shops')
export class Shop extends TimestampedEntity {
  @Column({ type: 'varchar' })
  name: string;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', nullable: true })
  phone: string | null;

  @Column({ name: 'label_footer', type: 'varchar', nullable: true })
  labelFooter: string | null;
}
