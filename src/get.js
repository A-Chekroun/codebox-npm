import npm from './adapters/npm';
import S3 from './adapters/s3';
import Logger from './adapters/logger';

export default async (event, context, callback) => {
  const { registry, bucket, region, logTopic } = process.env;
  const user = {
    name: event.requestContext.authorizer.username,
    avatar: event.requestContext.authorizer.avatar,
  };
  const storage = new S3({ region, bucket });
  const log = new Logger('package:get', { region, topic: logTopic });

  const name = `${decodeURIComponent(event.pathParameters.name)}`;

  try {
    const pkgBuffer = await storage.get(`${name}/index.json`);
    const json = JSON.parse(pkgBuffer.toString());
    json._attachments = {}; // eslint-disable-line no-underscore-dangle

    return callback(null, {
      statusCode: 200,
      body: JSON.stringify(json),
    });
  } catch (storageError) {
    if (storageError.code === 'NoSuchKey') {
      try {
        const data = await npm.package(registry, event.pathParameters.name);

        return callback(null, {
          statusCode: 200,
          body: JSON.stringify(data),
        });
      } catch (npmError) {
        if (npmError.status === 500) {
          await log.error(user, npmError);
        }

        return callback(null, {
          statusCode: npmError.status,
          body: JSON.stringify({
            error: npmError.message,
          }),
        });
      }
    }

    await log.error(user, storageError);

    return callback(null, {
      statusCode: 500,
      body: JSON.stringify({
        error: storageError.message,
      }),
    });
  }
};
