import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";
import { isSafeUrl } from '../lib/url-safety.js';

// Deliberately permissive — just enough to catch obvious typos (empty,
// whitespace, no registry/repo separator at all) before wasting a skopeo
// call. Real validation happens when Preview actually queries the registry.
function looksLikeImageRef(value) {
    const trimmed = value.trim();
    return trimmed.length > 0 && !/\s/.test(trimmed) && trimmed.includes('/');
}

export const SwitchImage = ({
    switching,
    disabled,
    switchDisabled,
    onSwitch,
    previewing,
    preview,
    previewError,
    onPreview,
    onDismissPreview,
    onRefChange,
}) => {
    const [ref, setRef] = useState('');

    function updateRef(value) {
        setRef(value);
        if (onRefChange) onRefChange(value);
    }

    return (
        <>
                <Flex alignItems={{ default: 'alignItemsCenter' }} className="ct-switch-row">
                    <FlexItem>
                        <label htmlFor="switch-image-ref" className="ct-switch-label">Track a different image:</label>
                    </FlexItem>
                    <FlexItem grow={{ default: 'grow' }}>
                        <TextInput
                            id="switch-image-ref"
                            type="text"
                            value={ref}
                            onChange={(_event, value) => updateRef(value)}
                            onKeyDown={event => {
                                if (event.key === 'Enter' && !disabled && !previewing && looksLikeImageRef(ref)) {
                                    event.preventDefault();
                                    onPreview(ref);
                                }
                            }}
                            placeholder="registry.example.com/namespace/image:tag"
                            aria-label="Image reference"
                        />
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant="secondary"
                            onClick={() => (preview || previewError) ? onDismissPreview() : onPreview(ref)}
                            isDisabled={disabled || previewing || (!(preview || previewError) && !looksLikeImageRef(ref))}
                            isLoading={previewing}
                        >
                            {previewing ? "Inspecting…" : (preview || previewError) ? "Hide Inspection" : "Inspect"}
                        </Button>
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant={preview ? "primary" : "secondary"}
                            onClick={() => onSwitch(ref)}
                            isDisabled={disabled || switchDisabled || switching || !ref.trim() || !preview}
                            isLoading={switching}
                        >
                            {switching ? "Switching…" : "Switch"}
                        </Button>
                    </FlexItem>
                </Flex>

                {previewError && (
                    <p className="ct-switch-preview-error">Could not inspect image: {previewError}</p>
                )}

                {preview && !previewError && (
                    <div className="ct-switch-preview-block">
                    <DescriptionList isCompact isHorizontal className="ct-switch-preview">
                        <DescriptionListGroup>
                            <DescriptionListTerm>Version</DescriptionListTerm>
                            <DescriptionListDescription>{preview.version || "Unknown"}</DescriptionListDescription>
                        </DescriptionListGroup>
                        {preview.rhelVersion && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>RHEL version</DescriptionListTerm>
                                <DescriptionListDescription>{preview.rhelVersion}</DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                        <DescriptionListGroup>
                            <DescriptionListTerm>Digest</DescriptionListTerm>
                            <DescriptionListDescription>
                                <code>{preview.digest}</code>
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm>Created</DescriptionListTerm>
                            <DescriptionListDescription>
                                {preview.created ? new Date(preview.created).toLocaleString() : "Unknown"}
                            </DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm>Architecture</DescriptionListTerm>
                            <DescriptionListDescription>{preview.architecture || "Unknown"}</DescriptionListDescription>
                        </DescriptionListGroup>
                        {preview.alsoTagged?.length > 0 && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>Also tagged</DescriptionListTerm>
                                <DescriptionListDescription>{preview.alsoTagged.join(", ")}</DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                        {preview.source && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>Base image source</DescriptionListTerm>
                                <DescriptionListDescription>
                                    {isSafeUrl(preview.source)
                                        ? <a href={preview.source} target="_blank" rel="noopener noreferrer">{preview.source}</a>
                                        : preview.source}
                                    {preview.revision && <> @ <code>{preview.revision.slice(0, 12)}</code></>}
                                </DescriptionListDescription>
                            </DescriptionListGroup>
                        )}
                    </DescriptionList>
                    </div>
                )}
        </>
    );
};
