import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import { promises as fs } from 'fs';
import * as path from 'path';

/**
 * StorageService — manages the lifecycle of a project's on-disk artifact
 * directory in LOCAL_STORAGE mode, mirroring the layout S3Service writes into
 * (storage/any-bucket/repos/{projectId}/...).
 *
 * SECURITY: every path is confined to the storage root. Project IDs are
 * validated against an allowlist format, reduced to a bare path segment, and
 * resolved paths are verified to remain inside the root before any mkdir/rm
 * touches the filesystem, preventing path traversal via crafted IDs
 * (e.g. "../../etc"). Deletion — the most destructive op — gets the strictest
 * containment check.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly storageRoot: string;
  private readonly reposRoot: string;

  // Project IDs in this codebase are UUID v4 (8-4-4-4-12 hex with hyphens),
  // e.g. "785d3bbb-2985-40f3-a987-bd7d4bdba9fe". We also accept cuid()-shaped
  // IDs (leading 'c' + base36) for forward-compatibility with the Prisma
  // schema default. Both formats contain ONLY [a-z0-9-]: no path separators,
  // no dots, no traversal sequences — which is the property that matters for
  // path safety. Anything else is rejected.
  private static readonly UUID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  private static readonly CUID_PATTERN = /^c[a-z0-9]{20,40}$/i;

  constructor(private readonly configService: ConfigService) {
    // Match S3Service exactly: <cwd>/storage/any-bucket, files under repos/.
    this.storageRoot = path.resolve(process.cwd(), 'storage', 'any-bucket');
    this.reposRoot = path.join(this.storageRoot, 'repos');
  }

  /**
   * Validate a project ID and return the absolute, traversal-safe path to its
   * directory. Throws BadRequestException on any invalid or escaping input.
   *
   * Defense in depth, in order:
   *   1. Type/empty check.
   *   2. Allowlist format check (UUID or cuid) — neither admits '/', '\', or '.'.
   *   3. Reduce to path.basename and require equality — no path component can
   *      survive to the resolve call.
   *   4. Resolve under reposRoot, then containment-check the resolved path.
   */
  private resolveProjectPath(projectId: string): string {
    if (typeof projectId !== 'string' || projectId.length === 0) {
      throw new BadRequestException('Invalid projectId: empty');
    }

    const isValidFormat =
      StorageService.UUID_PATTERN.test(projectId) ||
      StorageService.CUID_PATTERN.test(projectId);
    if (!isValidFormat) {
      throw new BadRequestException('Invalid projectId: failed format check');
    }

    // Reduce to a single, separator-free path segment. After the format check
    // above this is already clean, but taking basename and rejecting any
    // difference guarantees no directory component can reach path.resolve below.
    const safeId = path.basename(projectId);
    if (safeId !== projectId || safeId === '.' || safeId === '..') {
      throw new BadRequestException('Invalid projectId: path component rejected');
    }

    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    // Justification (audited false positive): `safeId` cannot contain a path
    // component or traversal sequence. It has passed (a) a UUID/cuid allowlist
    // format check — both formats admit only [a-z0-9-], no '/', '\', or '.',
    // and (b) a path.basename equality check that rejects any value carrying a
    // directory component. The resolved `candidate` is additionally
    // containment-checked against reposRoot immediately below. Traversal is
    // not reachable; semgrep's taint heuristic flags the projectId→resolve
    // dataflow without modeling the intervening validation.
    const candidate = path.resolve(this.reposRoot, safeId);

    // Containment backstop: the resolved path must sit directly within reposRoot.
    // Guards against traversal even if an earlier check were ever loosened.
    const rel = path.relative(this.reposRoot, candidate);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel) || rel.includes(path.sep)) {
      throw new BadRequestException('Invalid projectId: path escapes storage root');
    }
    return candidate;
  }

  /**
   * Return the on-disk directory path for a project (synchronous).
   * Path is validated; does not create the directory.
   */
  getProjectPath(projectId: string): string {
    return this.resolveProjectPath(projectId);
  }

  /**
   * Idempotently ensure the project's directory exists.
   */
  async ensureProjectDirectory(projectId: string): Promise<void> {
    const dir = this.resolveProjectPath(projectId);
    try {
      await fs.mkdir(dir, { recursive: true });
      this.logger.debug(`Ensured project directory: repos/${projectId}`);
    } catch (error) {
      this.logger.error(`Failed to ensure project directory for ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Recursively delete a project's directory. Re-validates containment
   * immediately before removal and tolerates an already-absent directory.
   */
  async deleteProjectDirectory(projectId: string): Promise<void> {
    const dir = this.resolveProjectPath(projectId);

    // Defense in depth: never allow deletion of the root itself, and re-confirm
    // the target is strictly inside reposRoot right before the destructive call.
    const rel = path.relative(this.reposRoot, dir);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new BadRequestException('Refusing to delete: path escapes storage root');
    }

    try {
      await fs.rm(dir, { recursive: true, force: true });
      this.logger.debug(`Deleted project directory: repos/${projectId}`);
    } catch (error) {
      this.logger.error(`Failed to delete project directory for ${projectId}:`, error);
      throw error;
    }
  }
}
