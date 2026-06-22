import React, { useState } from 'react';
import { Button } from "@patternfly/react-core/dist/esm/components/Button/index.js";
import { DescriptionList, DescriptionListDescription, DescriptionListGroup, DescriptionListTerm } from "@patternfly/react-core/dist/esm/components/DescriptionList/index.js";
import { Flex, FlexItem } from "@patternfly/react-core/dist/esm/layouts/Flex/index.js";
import { FormSelect, FormSelectOption } from "@patternfly/react-core/dist/esm/components/FormSelect/index.js";
import { TextInput } from "@patternfly/react-core/dist/esm/components/TextInput/index.js";

function formatDigest(digest) {
    if (!digest) return null;
    const hash = digest.startsWith("sha256:") ? digest.slice(7) : digest;
    return "sha256:" + hash.slice(0, 12) + "…";
}

export const SwitchImage = ({
    recentRefs,
    switching,
    disabled,
    switchDisabled,
    onSwitch,
    previewing,
    preview,
    previewError,
    onPreview,
    onDismissPreview,
}) => {
    const [ref, setRef] = useState('');

    return (
        <>
                <Flex alignItems={{ default: 'alignItemsFlexEnd' }}>
                    {recentRefs.length > 0 && (
                        <FlexItem>
                            <FormSelect
                                aria-label="Recent image references"
                                value=""
                                onChange={(_event, value) => { if (value) setRef(value); }}
                            >
                                <FormSelectOption value="" label="Recent…" />
                                {recentRefs.map(r => <FormSelectOption key={r} value={r} label={r} />)}
                            </FormSelect>
                        </FlexItem>
                    )}
                    <FlexItem grow={{ default: 'grow' }}>
                        <TextInput
                            type="text"
                            value={ref}
                            onChange={(_event, value) => setRef(value)}
                            placeholder="registry.example.com/namespace/image:tag"
                            aria-label="Image reference"
                        />
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant="secondary"
                            onClick={() => onPreview(ref)}
                            isDisabled={disabled || previewing || !ref.trim()}
                            isLoading={previewing}
                        >
                            {previewing ? "Inspecting…" : "Preview"}
                        </Button>
                    </FlexItem>
                    <FlexItem>
                        <Button
                            variant="secondary"
                            onClick={() => onSwitch(ref)}
                            isDisabled={disabled || switchDisabled || switching || !ref.trim()}
                            isLoading={switching}
                        >
                            {switching ? "Switching…" : "Switch"}
                        </Button>
                    </FlexItem>
                </Flex>

                {previewError && (
                    <Flex justifyContent={{ default: 'justifyContentFlexStart' }} alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                        <FlexItem>
                            <p className="ct-switch-preview-error">Could not inspect image: {previewError}</p>
                        </FlexItem>
                        <FlexItem>
                            <Button variant="plain" onClick={onDismissPreview} aria-label="Dismiss">×</Button>
                        </FlexItem>
                    </Flex>
                )}

                {preview && !previewError && (
                    <div className="ct-switch-preview-block">
                        <Flex justifyContent={{ default: 'justifyContentFlexStart' }} alignItems={{ default: 'alignItemsCenter' }} spaceItems={{ default: 'spaceItemsSm' }}>
                            <FlexItem>
                                <p className="ct-switch-label">Preview</p>
                            </FlexItem>
                            <FlexItem>
                                <Button variant="plain" onClick={onDismissPreview} aria-label="Dismiss preview">×</Button>
                            </FlexItem>
                        </Flex>
                    <DescriptionList isCompact isHorizontal className="ct-switch-preview">
                        <DescriptionListGroup>
                            <DescriptionListTerm>Version</DescriptionListTerm>
                            <DescriptionListDescription>{preview.version || "Unknown"}</DescriptionListDescription>
                        </DescriptionListGroup>
                        <DescriptionListGroup>
                            <DescriptionListTerm>Digest</DescriptionListTerm>
                            <DescriptionListDescription>
                                <code title={preview.digest}>{formatDigest(preview.digest)}</code>
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
                        {preview.source && (
                            <DescriptionListGroup>
                                <DescriptionListTerm>Source</DescriptionListTerm>
                                <DescriptionListDescription>
                                    <a href={preview.source} target="_blank" rel="noopener noreferrer">{preview.source}</a>
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
