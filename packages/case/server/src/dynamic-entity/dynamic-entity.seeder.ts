import { Injectable } from '@nestjs/common'
import * as chalk from 'chalk'
import { DataSource, EntityMetadata, Repository } from 'typeorm'
import { ColumnMetadata } from 'typeorm/metadata/ColumnMetadata'

import { PropType } from '../../../shared/enums/prop-type.enum'
import { EntityDefinition } from '../../../shared/interfaces/entity-definition.interface'
import { FileUploadService } from '../file-upload/file-upload.service'
import { ImageUploadService } from '../file-upload/image-upload.service'

@Injectable()
export class DynamicEntitySeeder {
  defaultSeedCount = 10

  constructor(
    private dataSource: DataSource,
    private fileUploadService: FileUploadService,
    private imageUploadService: ImageUploadService
  ) {}

  async seed(tableName?: string) {
    let entities: EntityMetadata[] = this.orderEntities(
      this.dataSource.entityMetadatas
    )

    if (tableName) {
      entities = entities.filter(
        (entity: EntityMetadata) => entity.tableName === tableName
      )
    }

    const queryRunner = this.dataSource.createQueryRunner()

    await queryRunner.query('PRAGMA foreign_keys = OFF')

    await Promise.all(
      entities.map(async (entity: EntityMetadata) =>
        queryRunner
          .query(`DELETE FROM ${entity.tableName}`)
          .then(() =>
            queryRunner.query(
              `DELETE FROM sqlite_sequence WHERE name = '${entity.tableName}'`
            )
          )
      )
    )

    await queryRunner.query('PRAGMA foreign_keys = ON')

    console.log(chalk.blue('[x] Removed all existing data...'))

    let addDummyDocument: boolean = false
    let addDummyImage: boolean = false

    for (const entity of entities) {
      const definition: EntityDefinition = (entity.target as any).definition

      const entityRepository: Repository<any> = this.getRepository(
        entity.tableName
      )

      const seedCount: number = definition.seedCount || this.defaultSeedCount

      console.log(
        chalk.blue(`[x] Seeding ${seedCount} ${definition.namePlural}...`)
      )

      for (const index of Array(seedCount).keys()) {
        const newItem = entityRepository.create()

        entity.columns.forEach((column: ColumnMetadata) => {
          if (column.propertyName === 'id' || column.propertyName === 'token') {
            return
          }

          const propSeederFn: (
            index?: number,
            relationSeedCount?: number
          ) => any = Reflect.getMetadata(`${column.propertyName}:seed`, newItem)

          const propType: PropType = Reflect.getMetadata(
            `${column.propertyName}:type`,
            newItem
          )

          if (propType === PropType.Relation) {
            const relatedEntity = Reflect.getMetadata(
              `${column.propertyName}:options`,
              newItem
            )?.entity

            newItem[`${column.propertyName}`] = propSeederFn(
              index,
              relatedEntity.definition.seedCount || this.defaultSeedCount
            )
          } else {
            newItem[column.propertyName] = propSeederFn(index)
          }

          if (propType === PropType.File) {
            addDummyDocument = true
          }

          if (propType === PropType.Image) {
            addDummyImage = true
          }
        })

        // Save without listeners to avoid triggering the beforeInsert hook.
        await entityRepository.save(newItem, { listeners: false })
      }
    }

    if (addDummyDocument) {
      this.fileUploadService.addDummyDocument()
    }

    if (addDummyImage) {
      this.imageUploadService.addDummyImages()
    }
  }

  private getRepository(entityTableName: string): Repository<any> {
    const entity: EntityMetadata = this.dataSource.entityMetadatas.find(
      (entity: EntityMetadata) => entity.tableName === entityTableName
    )

    if (!entity) {
      throw new Error('Entity not found')
    }

    return this.dataSource.getRepository(entity.target)
  }

  // Order entities so that entities with relations are seeded after entities they depend on.
  private orderEntities(entities: EntityMetadata[]): EntityMetadata[] {
    const orderedEntities: EntityMetadata[] = []

    entities.forEach((entity: EntityMetadata) => {
      const relationColumns: ColumnMetadata[] = entity.columns.filter(
        (column: ColumnMetadata) => column.relationMetadata
      )

      if (!relationColumns.length) {
        orderedEntities.push(entity)
      } else {
        relationColumns.forEach((relationColumn: ColumnMetadata) => {
          const relatedEntity: EntityMetadata =
            relationColumn.relationMetadata.entityMetadata

          if (orderedEntities.includes(relatedEntity)) {
            orderedEntities.splice(
              orderedEntities.indexOf(relatedEntity),
              0,
              entity
            )
          } else {
            orderedEntities.push(entity)
          }
        })
      }
    })

    return orderedEntities
  }
}
